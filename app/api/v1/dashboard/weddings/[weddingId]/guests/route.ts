import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const addGuestSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  group_label: z.string().max(100).optional().or(z.literal('')),
  rsvp_status: z.enum(['pending', 'attending', 'declined']).optional(),
});

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/guests
 * List all guests for a wedding.
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
    const search = request.nextUrl.searchParams.get('q');

    let result;
    if (search && search.length >= 2) {
      result = await pool.query(
        `SELECT id, first_name, last_name, display_name, email, phone, group_label, rsvp_status, created_at
         FROM guests WHERE wedding_id = $1
         AND (first_name ILIKE $2 OR last_name ILIKE $2 OR display_name ILIKE $2 OR email ILIKE $2)
         ORDER BY last_name, first_name`,
        [weddingId, `%${search}%`]
      );
    } else {
      result = await pool.query(
        `SELECT id, first_name, last_name, display_name, email, phone, group_label, rsvp_status, created_at
         FROM guests WHERE wedding_id = $1
         ORDER BY last_name, first_name`,
        [weddingId]
      );
    }

    return Response.json({ guests: result.rows });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/guests
 * Add a single guest manually.
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
    const parsed = addGuestSchema.parse(body);
    const pool = getPool();

    const result = await pool.query(
      `INSERT INTO guests (wedding_id, first_name, last_name, email, phone, group_label, rsvp_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, first_name, last_name, display_name, email, phone, group_label, rsvp_status, created_at`,
      [
        weddingId,
        parsed.first_name.trim(),
        parsed.last_name.trim(),
        parsed.email || null,
        parsed.phone || null,
        parsed.group_label || null,
        parsed.rsvp_status || 'pending',
      ]
    );

    return Response.json({ guest: result.rows[0] }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

