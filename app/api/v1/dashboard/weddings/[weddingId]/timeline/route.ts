import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const createSchema = z.object({
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  event_name: z.string().max(200).nullable().optional(),
  time_label: z.string().max(80).nullable().optional(),
  sort_order: z.number().int().optional(),
  action: z.string().min(1).max(2000),
  location: z.string().max(300).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  status: z.string().max(50).nullable().optional(),
  deadline: z.boolean().optional(),
  vendor_ids: z.array(z.string().uuid()).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    const entriesResult = await pool.query(
      `SELECT id, event_date, event_name, time_label, sort_order, action,
              location, notes, status, deadline, created_at, updated_at
       FROM timeline_entries
       WHERE wedding_id = $1
       ORDER BY event_date ASC NULLS LAST, sort_order ASC`,
      [weddingId]
    );

    const linksResult = await pool.query(
      `SELECT tev.timeline_entry_id, tev.vendor_id, tev.role, v.name
       FROM timeline_entry_vendors tev
       JOIN vendors v ON v.id = tev.vendor_id
       WHERE v.wedding_id = $1`,
      [weddingId]
    );

    type LinkRow = { timeline_entry_id: string; vendor_id: string; role: string; name: string };
    const linksByEntry = new Map<string, Array<{ id: string; name: string; role: string }>>();
    for (const row of linksResult.rows as LinkRow[]) {
      const list = linksByEntry.get(row.timeline_entry_id) || [];
      list.push({ id: row.vendor_id, name: row.name, role: row.role });
      linksByEntry.set(row.timeline_entry_id, list);
    }

    const entries = entriesResult.rows.map((e) => ({
      ...e,
      vendors: linksByEntry.get(e.id) || [],
    }));

    return Response.json({ data: { entries } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }
    const d = parsed.data;

    const pool = getPool();
    const ins = await pool.query(
      `INSERT INTO timeline_entries
         (wedding_id, event_date, event_name, time_label, sort_order,
          action, location, notes, status, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        weddingId,
        d.event_date ?? null,
        d.event_name ?? null,
        d.time_label ?? null,
        d.sort_order ?? 0,
        d.action,
        d.location ?? null,
        d.notes ?? null,
        d.status ?? null,
        d.deadline ?? false,
      ]
    );
    const entryId = ins.rows[0].id;

    if (d.vendor_ids && d.vendor_ids.length > 0) {
      // Only allow assigning vendors that belong to this wedding.
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

    return Response.json({ data: { id: entryId } });
  } catch (error) {
    return handleApiError(error);
  }
}
