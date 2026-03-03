import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const updateGuestSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional().or(z.literal('')).or(z.null()),
  phone: z.string().max(30).optional().or(z.literal('')).or(z.null()),
  group_label: z.string().max(100).optional().or(z.literal('')).or(z.null()),
  rsvp_status: z.enum(['pending', 'attending', 'declined']).optional(),
});

/**
 * PUT /api/v1/dashboard/weddings/[weddingId]/guests/[guestId]
 * Update a guest.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; guestId: string }> }
) {
  try {
    const { weddingId, guestId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const parsed = updateGuestSchema.parse(body);
    const pool = getPool();

    // Build dynamic SET clause
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (parsed.first_name !== undefined) {
      sets.push(`first_name = $${idx++}`);
      values.push(parsed.first_name.trim());
    }
    if (parsed.last_name !== undefined) {
      sets.push(`last_name = $${idx++}`);
      values.push(parsed.last_name.trim());
    }
    if (parsed.email !== undefined) {
      sets.push(`email = $${idx++}`);
      values.push(parsed.email || null);
    }
    if (parsed.phone !== undefined) {
      sets.push(`phone = $${idx++}`);
      values.push(parsed.phone || null);
    }
    if (parsed.group_label !== undefined) {
      sets.push(`group_label = $${idx++}`);
      values.push(parsed.group_label || null);
    }
    if (parsed.rsvp_status !== undefined) {
      sets.push(`rsvp_status = $${idx++}`);
      values.push(parsed.rsvp_status);
    }

    if (sets.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No fields to update');
    }

    values.push(guestId, weddingId);
    const result = await pool.query(
      `UPDATE guests SET ${sets.join(', ')}
       WHERE id = $${idx++} AND wedding_id = $${idx}
       RETURNING id, first_name, last_name, display_name, email, phone, group_label, rsvp_status, created_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new AppError('AUTH_GUEST_NOT_FOUND');
    }

    return Response.json({ guest: result.rows[0] });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/v1/dashboard/weddings/[weddingId]/guests/[guestId]
 * Delete a guest.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; guestId: string }> }
) {
  try {
    const { weddingId, guestId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM guests WHERE id = $1 AND wedding_id = $2 RETURNING id',
      [guestId, weddingId]
    );

    if (result.rows.length === 0) {
      throw new AppError('AUTH_GUEST_NOT_FOUND');
    }

    return Response.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
