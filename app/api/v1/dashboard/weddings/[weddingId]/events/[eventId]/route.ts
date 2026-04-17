import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { toDateString } from '@/lib/db/format';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const updateEventSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  date: z.string().optional().or(z.null()),
  start_time: z.string().optional().or(z.null()),
  end_time: z.string().optional().or(z.null()),
  end_date: z.string().optional().or(z.null()),
  venue_name: z.string().max(200).optional().or(z.null()),
  venue_address: z.string().max(500).optional().or(z.null()),
  dress_code: z.string().max(1000).optional().or(z.null()),
  description: z.string().max(2000).optional().or(z.null()),
  logistics: z.string().max(2000).optional().or(z.null()),
  accent_color: z.string().max(20).optional().or(z.null()),
  sort_order: z.number().int().optional(),
});

/**
 * PUT /api/v1/dashboard/weddings/[weddingId]/events/[eventId]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; eventId: string }> }
) {
  try {
    const { weddingId, eventId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const parsed = updateEventSchema.parse(body);
    const pool = getPool();

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const fields: (keyof typeof parsed)[] = [
      'name', 'date', 'start_time', 'end_time', 'end_date', 'venue_name', 'venue_address',
      'dress_code', 'description', 'logistics', 'accent_color', 'sort_order',
    ];

    for (const field of fields) {
      if (parsed[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        const val = parsed[field];
        values.push(typeof val === 'string' ? val.trim() || null : val ?? null);
      }
    }

    if (sets.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No fields to update');
    }

    values.push(eventId, weddingId);
    const result = await pool.query(
      `UPDATE events SET ${sets.join(', ')}
       WHERE id = $${idx++} AND wedding_id = $${idx}
       RETURNING id, name, date, start_time, end_time, end_date, venue_name, venue_address,
                 dress_code, description, logistics, accent_color, sort_order, created_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND', 'Event not found');
    }

    // Clear FAQ cache since event details are used in chat answers
    await pool.query('DELETE FROM faq_cache WHERE wedding_id = $1', [weddingId]);

    const event = { ...result.rows[0], date: toDateString(result.rows[0].date), end_date: toDateString(result.rows[0].end_date) };
    return Response.json({ event });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/dashboard/weddings/[weddingId]/events/[eventId]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; eventId: string }> }
) {
  try {
    const { weddingId, eventId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM events WHERE id = $1 AND wedding_id = $2 RETURNING id',
      [eventId, weddingId]
    );

    if (result.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND', 'Event not found');
    }

    // Clear FAQ cache since event details are used in chat answers
    await pool.query('DELETE FROM faq_cache WHERE wedding_id = $1', [weddingId]);

    return Response.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
