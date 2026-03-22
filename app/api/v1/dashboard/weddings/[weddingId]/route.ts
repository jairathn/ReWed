import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const updateWeddingSchema = z.object({
  timezone: z.string().max(100).optional(),
  venue_city: z.string().max(200).optional(),
  venue_country: z.string().max(200).optional(),
  venue_lat: z.number().min(-90).max(90).optional(),
  venue_lng: z.number().min(-180).max(180).optional(),
});

/**
 * PATCH /api/v1/dashboard/weddings/[weddingId]
 * Update wedding-level settings.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const parsed = updateWeddingSchema.parse(body);
    const pool = getPool();

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (parsed.timezone !== undefined) {
      sets.push(`timezone = $${idx++}`);
      values.push(parsed.timezone);
    }
    if (parsed.venue_city !== undefined) {
      sets.push(`venue_city = $${idx++}`);
      values.push(parsed.venue_city);
    }
    if (parsed.venue_country !== undefined) {
      sets.push(`venue_country = $${idx++}`);
      values.push(parsed.venue_country);
    }
    if (parsed.venue_lat !== undefined) {
      sets.push(`venue_lat = $${idx++}`);
      values.push(parsed.venue_lat);
    }
    if (parsed.venue_lng !== undefined) {
      sets.push(`venue_lng = $${idx++}`);
      values.push(parsed.venue_lng);
    }

    if (sets.length === 0) {
      return Response.json({ ok: true });
    }

    values.push(weddingId);
    await pool.query(
      `UPDATE weddings SET ${sets.join(', ')} WHERE id = $${idx}`,
      values
    );

    return Response.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
