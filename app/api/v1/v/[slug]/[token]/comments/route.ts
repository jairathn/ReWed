import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db/client';
import { authenticateVendor } from '@/lib/vendor/auth';
import { sendVendorProposalEmail } from '@/lib/vendor/emails';
import { handleApiError, AppError } from '@/lib/errors';

const createSchema = z.object({
  comment: z.string().min(2).max(2000),
  proposed_change: z.string().max(2000).optional().nullable(),
  timeline_entry_id: z.string().uuid().optional().nullable(),
});

const DEFAULT_NOTIFICATION_EMAIL = 'shriyaneilwedding@gmail.com';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string }> }
) {
  try {
    const { slug, token } = await params;
    const pool = getPool();
    const ctx = await authenticateVendor(pool, slug, token);

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }
    const d = parsed.data;

    // If an entry id is provided, make sure it belongs to this wedding AND the
    // vendor is assigned to it. Otherwise we clear it — vendors can't comment
    // on entries they aren't part of.
    let entryId: string | null = null;
    let entryDescription: string | null = null;
    if (d.timeline_entry_id) {
      const check = await pool.query(
        `SELECT te.id, te.event_date, te.event_name, te.time_label, te.action
         FROM timeline_entries te
         JOIN timeline_entry_vendors tev ON tev.timeline_entry_id = te.id
         WHERE te.id = $1 AND te.wedding_id = $2 AND tev.vendor_id = $3`,
        [d.timeline_entry_id, ctx.wedding.id, ctx.vendor.id]
      );
      if (check.rows.length > 0) {
        entryId = check.rows[0].id;
        const r = check.rows[0];
        const dateStr = r.event_date
          ? new Date(r.event_date).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric',
            })
          : '';
        entryDescription = [
          dateStr,
          r.event_name,
          r.time_label,
          r.action?.slice(0, 80),
        ]
          .filter(Boolean)
          .join(' · ');
      }
    }

    const ins = await pool.query(
      `INSERT INTO vendor_comments
         (wedding_id, vendor_id, timeline_entry_id, comment, proposed_change)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [ctx.wedding.id, ctx.vendor.id, entryId, d.comment, d.proposed_change ?? null]
    );

    const notificationEmail =
      (typeof ctx.wedding.config.vendor_notification_email === 'string'
        ? ctx.wedding.config.vendor_notification_email
        : '') || DEFAULT_NOTIFICATION_EMAIL;

    // Fire email best-effort — the comment itself is persisted so the couple
    // can still see it in the dashboard even if email delivery fails.
    const email = await sendVendorProposalEmail(pool, {
      weddingId: ctx.wedding.id,
      weddingName: ctx.wedding.display_name,
      vendorId: ctx.vendor.id,
      vendorName: ctx.vendor.name,
      vendorEmail: ctx.vendor.email,
      notificationEmail,
      comment: d.comment,
      proposedChange: d.proposed_change ?? null,
      entryDescription,
    });

    return Response.json({
      data: {
        id: ins.rows[0].id,
        created_at: ins.rows[0].created_at,
        email_sent: email.sent,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
