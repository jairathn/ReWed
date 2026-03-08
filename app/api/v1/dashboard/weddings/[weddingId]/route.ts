import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const updateWeddingSchema = z.object({
  timezone: z.string().max(100).optional(),
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
