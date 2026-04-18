import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { requireWeddingAccess } from '@/lib/dashboard-auth';
import { diffTimelineEntry, sendTimelineChangeEmail } from '@/lib/vendor/emails';

const patchSchema = z.object({
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  event_name: z.string().max(200).nullable().optional(),
  time_label: z.string().max(80).nullable().optional(),
  sort_order: z.number().int().optional(),
  action: z.string().min(1).max(2000).optional(),
  location: z.string().max(300).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  status: z.string().max(50).nullable().optional(),
  deadline: z.boolean().optional(),
  vendor_ids: z.array(z.string().uuid()).optional(),
});

async function ensureEntryOwned(weddingId: string, entryId: string) {
  const pool = getPool();
  const row = await pool.query(
    `SELECT id FROM timeline_entries WHERE id = $1 AND wedding_id = $2`,
    [entryId, weddingId]
  );
  if (row.rows.length === 0) throw new AppError('WEDDING_NOT_FOUND');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; entryId: string }> }
) {
  try {
    const { weddingId, entryId } = await params;
    await requireWeddingAccess(request, weddingId);
    await ensureEntryOwned(weddingId, entryId);

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }
    const d = parsed.data;

    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    const fields = [
      'event_date', 'event_name', 'time_label', 'sort_order',
      'action', 'location', 'notes', 'status', 'deadline',
    ] as const;

    for (const f of fields) {
      if (d[f] !== undefined) {
        updates.push(`${f} = $${i++}`);
        values.push(d[f]);
      }
    }

    const pool = getPool();

    // Snapshot BEFORE state so we can diff for email notifications.
    const beforeResult = await pool.query(
      `SELECT event_date, event_name, time_label, action, location, notes, status
       FROM timeline_entries WHERE id = $1`,
      [entryId]
    );
    const before = beforeResult.rows[0] || {};

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(entryId);
      await pool.query(
        `UPDATE timeline_entries SET ${updates.join(', ')} WHERE id = $${i}`,
        values
      );
    }

    if (d.vendor_ids !== undefined) {
      await pool.query(
        `DELETE FROM timeline_entry_vendors WHERE timeline_entry_id = $1`,
        [entryId]
      );
      if (d.vendor_ids.length > 0) {
        const valid = await pool.query(
          `SELECT id FROM vendors WHERE wedding_id = $1 AND id = ANY($2::uuid[])`,
          [weddingId, d.vendor_ids]
        );
        for (const row of valid.rows) {
          await pool.query(
            `INSERT INTO timeline_entry_vendors (timeline_entry_id, vendor_id, role)
             VALUES ($1, $2, 'owner')
             ON CONFLICT DO NOTHING`,
            [entryId, row.id]
          );
        }
      }
    }

    // Notify assigned vendors if anything user-facing changed.
    const afterResult = await pool.query(
      `SELECT event_date, event_name, time_label, action, location, notes, status
       FROM timeline_entries WHERE id = $1`,
      [entryId]
    );
    const after = afterResult.rows[0] || {};
    const changeSummary = diffTimelineEntry(before, after);

    if (changeSummary) {
      const vendorRecipients = await pool.query(
        `SELECT v.id, v.name, v.email, v.access_token
         FROM timeline_entry_vendors tev
         JOIN vendors v ON v.id = tev.vendor_id
         WHERE tev.timeline_entry_id = $1 AND v.email IS NOT NULL`,
        [entryId]
      );

      const weddingResult = await pool.query(
        `SELECT slug, display_name FROM weddings WHERE id = $1`,
        [weddingId]
      );
      const wedding = weddingResult.rows[0];

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
      const entryDescription = [
        after.event_name,
        after.time_label,
        (after.action as string | null)?.slice(0, 80),
      ]
        .filter(Boolean)
        .join(' · ');

      for (const vendor of vendorRecipients.rows) {
        const portalUrl = `${appUrl}/v/${wedding.slug}/${vendor.access_token}`;
        // Fire and forget — failures are logged via vendor_email_log
        await sendTimelineChangeEmail(pool, {
          weddingId,
          weddingName: wedding.display_name,
          vendorId: vendor.id,
          vendorName: vendor.name,
          vendorEmail: vendor.email,
          portalUrl,
          changeSummary,
          entryDescription: entryDescription || 'your timeline entry',
        });
      }
    }

    return Response.json({ data: { id: entryId } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; entryId: string }> }
) {
  try {
    const { weddingId, entryId } = await params;
    await requireWeddingAccess(request, weddingId);
    await ensureEntryOwned(weddingId, entryId);

    const pool = getPool();
    await pool.query(`DELETE FROM timeline_entries WHERE id = $1`, [entryId]);
    return Response.json({ data: { id: entryId } });
  } catch (error) {
    return handleApiError(error);
  }
}
