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
  rsvp_status: 'pending' | 'attending' | 'declined';
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
        `SELECT id, first_name, last_name, email, rsvp_status
         FROM guests
         WHERE wedding_id = $1 AND id = ANY($2::uuid[]) AND email IS NOT NULL AND email != ''`,
        [weddingId, parsed.guest_ids]
      );
    } else if (parsed.audience === 'all') {
      guestsResult = await pool.query(
        `SELECT id, first_name, last_name, email, rsvp_status
         FROM guests
         WHERE wedding_id = $1 AND email IS NOT NULL AND email != ''`,
        [weddingId]
      );
    } else {
      guestsResult = await pool.query(
        `SELECT id, first_name, last_name, email, rsvp_status
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

    // Each email is personalized with the guest's name in the greeting,
    // so send them one-at-a-time rather than as one blast.
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
    for (let i = 0; i < guests.length; i += 2) {
      const chunk = guests.slice(i, i + 2);
      const chunkResults = await Promise.all(
        chunk.map(async (g) => {
          const template = buildGuestEmail({
            weddingName,
            heading: parsed.heading,
            body: parsed.body,
            ctaLabel: parsed.cta_label || undefined,
            ctaUrl: parsed.cta_url || undefined,
            footerNote:
              'You are receiving this because you were added to the guest list for this wedding.',
          });

          const res = await sendEmail({
            to: g.email!,
            subject: parsed.subject,
            html: template.html,
            text: template.text,
            replyTo,
          });
          return { email: g.email!, ...res };
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

      if (i + 2 < guests.length) {
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
