import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { canScheduleSms, scheduleSms, cancelScheduledSms } from '@/lib/messaging/twilio-client';
import { resolveRecipients } from '@/lib/messaging/recipients';
import { validateSendAt } from '@/lib/messaging/schedule-window';

const scheduleSchema = z.object({
  body: z.string().min(1).max(1600),
  audience: z
    .enum(['all', 'attending', 'pending', 'declined', 'group', 'selected'])
    .default('all'),
  group_labels: z.array(z.string().min(1)).optional(),
  guest_ids: z.array(z.string().uuid()).optional(),
  // Absolute instant (UTC ISO-8601) — the client converts the wall-clock
  // picker value from the wedding's timezone before sending.
  send_at: z.string().min(1),
});

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/sms/schedule
 *
 * Queue a broadcast for a future time via Twilio's native scheduling. Twilio
 * schedules one message per recipient, so we resolve and LOCK the audience now
 * (guests added/edited later won't be included — the couple must cancel and
 * reschedule) and store the per-recipient SIDs for the scheduled list and
 * cancellation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    if (!canScheduleSms()) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Scheduling requires a Twilio Messaging Service. Set TWILIO_MESSAGING_SERVICE_SID in your environment.'
      );
    }

    const parsed = scheduleSchema.parse(await request.json());

    const when = validateSendAt(parsed.send_at);
    if (!when.ok || !when.date) {
      throw new AppError('VALIDATION_ERROR', when.error || 'Invalid scheduled time');
    }

    const pool = getPool();
    const { recipients, skippedBadPhone } = await resolveRecipients(pool, weddingId, parsed);

    if (recipients.length === 0) {
      return Response.json({
        scheduled: 0,
        skipped: skippedBadPhone,
        message:
          skippedBadPhone > 0
            ? 'All matching guests have phone numbers missing a country code — fix them on the Guests page.'
            : 'No guests match the selected audience (or none have a phone on file).',
      });
    }

    // Schedule one message per recipient, paced like send-now (chunks of 5).
    const sids: string[] = [];
    const errors: Array<{ name: string; phone: string; error: string }> = [];
    for (let i = 0; i < recipients.length; i += 5) {
      const chunk = recipients.slice(i, i + 5);
      const chunkResults = await Promise.all(
        chunk.map(async (r) => {
          const res = await scheduleSms({ to: r.phone, body: parsed.body, sendAt: when.date! });
          return { ...r, sid: res.sid, error: res.error };
        })
      );
      for (const r of chunkResults) {
        if (r.error || !r.sid) {
          errors.push({ name: r.name, phone: r.phone, error: r.error || 'No SID returned' });
        } else {
          sids.push(r.sid);
        }
      }
      if (i + 5 < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    if (sids.length === 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        errors[0]?.error
          ? `Twilio rejected the schedule: ${errors[0].error}`
          : 'Twilio rejected the scheduled messages.'
      );
    }

    // The Twilio messages are now scheduled; the local record is our only
    // handle for listing and canceling them. If the insert fails (e.g. the
    // sms_scheduled table is missing — migration 027 not yet run), cancel the
    // just-scheduled messages so we don't orphan an uncancelable broadcast.
    let inserted;
    try {
      inserted = await pool.query(
        `INSERT INTO sms_scheduled
           (wedding_id, body, audience, group_labels, guest_ids, recipient_count,
            twilio_message_sids, send_at, status, errors, skipped_bad_phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'scheduled', $9, $10)
         RETURNING id`,
        [
          weddingId,
          parsed.body,
          parsed.audience,
          parsed.audience === 'group' ? parsed.group_labels : null,
          parsed.audience === 'selected' ? parsed.guest_ids : null,
          sids.length,
          sids,
          when.date.toISOString(),
          errors.length > 0 ? JSON.stringify(errors.slice(0, 10)) : null,
          skippedBadPhone,
        ]
      );
    } catch (insertErr) {
      console.error('[sms/schedule] insert failed — rolling back Twilio schedule:', insertErr);
      await Promise.allSettled(sids.map((sid) => cancelScheduledSms(sid)));
      throw new AppError(
        'VALIDATION_ERROR',
        'Could not save the scheduled text, so it was canceled. (If this persists, the sms_scheduled table may be missing — run migration 027.)'
      );
    }

    return Response.json({
      id: inserted.rows[0].id,
      scheduled: sids.length,
      failed: errors.length,
      skipped: skippedBadPhone,
      send_at: when.date.toISOString(),
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
