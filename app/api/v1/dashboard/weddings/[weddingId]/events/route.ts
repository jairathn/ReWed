import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  venue_name: z.string().max(200).optional(),
  venue_address: z.string().max(500).optional(),
  dress_code: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  logistics: z.string().max(2000).optional(),
  accent_color: z.string().max(20).optional(),
  sort_order: z.number().int().optional(),
});

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/events
 * List all events for this wedding.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, date, start_time, end_time, venue_name, venue_address,
              dress_code, description, logistics, accent_color, sort_order, created_at
       FROM events WHERE wedding_id = $1
       ORDER BY sort_order, date, start_time`,
      [weddingId]
    );

    return Response.json({ events: result.rows });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/events
 * Create a new event.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const parsed = createEventSchema.parse(body);
    const pool = getPool();

    const result = await pool.query(
      `INSERT INTO events (wedding_id, name, date, start_time, end_time, venue_name, venue_address,
                           dress_code, description, logistics, accent_color, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, name, date, start_time, end_time, venue_name, venue_address,
                 dress_code, description, logistics, accent_color, sort_order, created_at`,
      [
        weddingId,
        parsed.name.trim(),
        parsed.date || null,
        parsed.start_time || null,
        parsed.end_time || null,
        parsed.venue_name?.trim() || null,
        parsed.venue_address?.trim() || null,
        parsed.dress_code?.trim() || null,
        parsed.description?.trim() || null,
        parsed.logistics?.trim() || null,
        parsed.accent_color || null,
        parsed.sort_order ?? 0,
      ]
    );

    return Response.json({ event: result.rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

