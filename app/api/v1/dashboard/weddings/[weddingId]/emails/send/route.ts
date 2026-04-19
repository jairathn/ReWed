import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { isResendConfigured, sendEmail } from '@/lib/email/resend-client';
import { buildGuestEmail } from '@/lib/email/templates';
import { env } from '@/lib/env';

const sendSchema = z.object({
  subject: z.string().min(1).max(200),
  heading: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  cta_label: z.string().max(60).optional().or(z.literal('')),
  cta_url: z.string().url().optional().or(z.literal('')),
  // Audience filter
  audience: z.enum(['all', 'attending', 'pending', 'declined', 'selected']).default('all'),
  guest_ids: z.array(z.string().uuid()).optional(),
  reply_to: z.string().email().optional().or(z.literal('')),
});

interface GuestRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  party_id: string | null;
  party_role: string | null;
  rsvp_status: 'pending' | 'attending' | 'declined';
}

function formatGreeting(names: string[]): string {
  const filtered = names.filter(n => n && n !== '-' && n.toLowerCase() !== 'guest');
  if (filtered.length === 0) return '';
  if (filtered.length === 1) return `Hello ${filtered[0]},`;
  const last = filtered[filtered.length - 1];
  const rest = filtered.slice(0, -1);
  return `Hello ${rest.join(', ')} & ${last},`;
}

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/emails/send
 *
 * Compose and send a branded email to guests filtered by audience.
 * Returns a summary of sent/failed counts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    if (!isResendConfigured()) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Email service is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL in environment.'
      );
    }

    const body = await request.json();
    const parsed = sendSchema.parse(body);
    const pool = getPool();

    // Load wedding meta for template
    const weddingResult = await pool.query(
      'SELECT display_name FROM weddings WHERE id = $1',
      [weddingId]
    );
    const weddingName: string =
      weddingResult.rows[0]?.display_name || 'Your Wedding';

    // Build guest query based on audience
    let guestsResult;
    if (parsed.audience === 'selected') {
      if (!parsed.guest_ids || parsed.guest_ids.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'No guests selected');
      }
      guestsResult = await pool.query(
        `SELECT id, first_name, last_name, email, party_id, party_role, rsvp_status
         FROM guests
         WHERE wedding_id = $1 AND id = ANY($2::uuid[]) AND email IS NOT NULL AND email != ''`,
        [weddingId, parsed.guest_ids]
      );
    } else if (parsed.audience === 'all') {
      guestsResult = await pool.query(
        `SELECT id, first_name, last_name, email, party_id, party_role, rsvp_status
         FROM guests
         WHERE wedding_id = $1 AND email IS NOT NULL AND email != ''`,
        [weddingId]
      );
    } else {
      guestsResult = await pool.query(
        `SELECT id, first_name, last_name, email, party_id, party_role, rsvp_status
         FROM guests
         WHERE wedding_id = $1 AND rsvp_status = $2 AND email IS NOT NULL AND email != ''`,
        [weddingId, parsed.audience]
      );
    }

    const guests: GuestRow[] = guestsResult.rows;
    if (guests.length === 0) {
      return Response.json({
        sent: 0,
        failed: 0,
        skipped: 0,
        message: 'No guests match the selected audience (or none have an email on file).',
      });
    }

    // Look up all party members (including those without email) so we can
    // greet the whole household: "Hello Rahul, Sonia, Arush & Alina,"
    const partyIds = [...new Set(guests.map(g => g.party_id).filter(Boolean))] as string[];

    const partyMembersMap = new Map<string, string[]>();
    if (partyIds.length > 0) {
      const membersResult = await pool.query(
        `SELECT first_name, party_id, party_role
         FROM guests
         WHERE wedding_id = $1 AND party_id = ANY($2::uuid[])
         ORDER BY party_id,
           CASE party_role WHEN 'primary' THEN 0 WHEN 'partner' THEN 1 WHEN 'child' THEN 2 ELSE 3 END`,
        [weddingId, partyIds]
      );
      for (const row of membersResult.rows) {
        const list = partyMembersMap.get(row.party_id) || [];
        list.push(row.first_name);
        partyMembersMap.set(row.party_id, list);
      }
    }

    // Deduplicate: one email per party. For guests without a party, send individually.
    const seen = new Set<string>();
    const recipients: Array<{ email: string; greeting: string }> = [];

    for (const g of guests) {
      if (g.party_id) {
        if (seen.has(g.party_id)) continue;
        seen.add(g.party_id);
        const names = partyMembersMap.get(g.party_id) || [g.first_name];
        recipients.push({ email: g.email!, greeting: formatGreeting(names) });
      } else {
        recipients.push({ email: g.email!, greeting: formatGreeting([g.first_name]) });
      }
    }

    const replyTo =
      parsed.reply_to && parsed.reply_to.length > 0
        ? parsed.reply_to
        : env.RESEND_REPLY_TO;

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as Array<{ email: string; error: string }>,
    };

    // Simple rate-limited loop: ~2 req/s to respect free-tier limits.
    for (let i = 0; i < recipients.length; i += 2) {
      const chunk = recipients.slice(i, i + 2);
      const chunkResults = await Promise.all(
        chunk.map(async (r) => {
          const template = buildGuestEmail({
            weddingName,
            greeting: r.greeting,
            heading: parsed.heading,
            body: parsed.body,
            ctaLabel: parsed.cta_label || undefined,
            ctaUrl: parsed.cta_url || undefined,
            footerNote:
              'You are receiving this because you were added to the guest list for this wedding.',
          });

          const res = await sendEmail({
            to: r.email,
            subject: parsed.subject,
            html: template.html,
            text: template.text,
            replyTo,
          });
          return { email: r.email, ...res };
        })
      );

      for (const r of chunkResults) {
        if (r.error) {
          results.failed += 1;
          results.errors.push({ email: r.email, error: r.error });
        } else {
          results.sent += 1;
        }
      }

      if (i + 2 < recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }

    return Response.json({
      sent: results.sent,
      failed: results.failed,
      total: guests.length,
      errors: results.errors.slice(0, 10), // cap error detail
    });
  } catch (error) {
    return handleApiError(error);
  }
}
