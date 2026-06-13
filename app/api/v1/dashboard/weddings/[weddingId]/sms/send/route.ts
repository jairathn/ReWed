import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { isTwilioConfigured, sendSms } from '@/lib/messaging/twilio-client';
import { normalizePhone } from '@/lib/messaging/normalize-phone';

const sendSchema = z.object({
  // 1600 chars is Twilio's hard cap on Body (10 concatenated segments)
  body: z.string().min(1).max(1600),
  audience: z
    .enum(['all', 'attending', 'pending', 'declined', 'group', 'selected'])
    .default('all'),
  group_labels: z.array(z.string().min(1)).optional(),
  guest_ids: z.array(z.string().uuid()).optional(),
});

interface GuestRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
}

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/sms/send
 *
 * Broadcast one SMS body to an audience of guests via Twilio. Guests whose
 * phone doesn't normalize to E.164 are skipped (and counted); duplicate
 * numbers (couples sharing a phone) get one text. Returns a summary and
 * records it in sms_messages for the history list.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    if (!isTwilioConfigured()) {
      throw new AppError(
        'VALIDATION_ERROR',
        'SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in environment.'
      );
    }

    const parsed = sendSchema.parse(await request.json());
    const pool = getPool();

    const baseSelect = `
      SELECT id, first_name, last_name, phone
      FROM guests
      WHERE wedding_id = $1 AND phone IS NOT NULL AND phone != '' AND soft_deleted_at IS NULL`;

    let guestsResult;
    if (parsed.audience === 'selected') {
      if (!parsed.guest_ids || parsed.guest_ids.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'No guests selected');
      }
      guestsResult = await pool.query(`${baseSelect} AND id = ANY($2::uuid[])`, [
        weddingId,
        parsed.guest_ids,
      ]);
    } else if (parsed.audience === 'group') {
      if (!parsed.group_labels || parsed.group_labels.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'No groups selected');
      }
      guestsResult = await pool.query(`${baseSelect} AND group_label = ANY($2::text[])`, [
        weddingId,
        parsed.group_labels,
      ]);
    } else if (parsed.audience === 'all') {
      guestsResult = await pool.query(baseSelect, [weddingId]);
    } else {
      guestsResult = await pool.query(`${baseSelect} AND rsvp_status = $2`, [
        weddingId,
        parsed.audience,
      ]);
    }

    const guests: GuestRow[] = guestsResult.rows;

    // Normalize + dedupe: one text per phone number
    const seen = new Set<string>();
    const recipients: Array<{ name: string; phone: string }> = [];
    let skippedBadPhone = 0;

    for (const g of guests) {
      const norm = normalizePhone(g.phone);
      if (!norm.ok) {
        skippedBadPhone += 1;
        continue;
      }
      if (seen.has(norm.e164!)) continue;
      seen.add(norm.e164!);
      recipients.push({ name: `${g.first_name} ${g.last_name}`.trim(), phone: norm.e164! });
    }

    if (recipients.length === 0) {
      return Response.json({
        sent: 0,
        failed: 0,
        skipped: skippedBadPhone,
        message:
          skippedBadPhone > 0
            ? 'All matching guests have phone numbers missing a country code — fix them on the Guests page.'
            : 'No guests match the selected audience (or none have a phone on file).',
      });
    }

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as Array<{ name: string; phone: string; error: string }>,
    };

    // Twilio queues outbound messages itself (carrier-paced), so we only
    // pace the API calls, not delivery: chunks of 5, short breather between.
    for (let i = 0; i < recipients.length; i += 5) {
      const chunk = recipients.slice(i, i + 5);
      const chunkResults = await Promise.all(
        chunk.map(async (r) => {
          const res = await sendSms({ to: r.phone, body: parsed.body });
          return { ...r, error: res.error };
        })
      );
      for (const r of chunkResults) {
        if (r.error) {
          results.failed += 1;
          results.errors.push({ name: r.name, phone: r.phone, error: r.error });
        } else {
          results.sent += 1;
        }
      }
      if (i + 5 < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    // Best-effort history (table arrives in migration 026)
    try {
      await pool.query(
        `INSERT INTO sms_messages
           (wedding_id, body, audience, group_labels, recipient_count,
            sent_count, failed_count, skipped_bad_phone, errors)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          weddingId,
          parsed.body,
          parsed.audience,
          parsed.audience === 'group' ? parsed.group_labels : null,
          recipients.length,
          results.sent,
          results.failed,
          skippedBadPhone,
          results.errors.length > 0 ? JSON.stringify(results.errors.slice(0, 10)) : null,
        ]
      );
    } catch (err) {
      console.warn('[sms/send] history insert failed (run migration 026):', err);
    }

    return Response.json({
      sent: results.sent,
      failed: results.failed,
      skipped: skippedBadPhone,
      total: recipients.length,
      errors: results.errors.slice(0, 10),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
