import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const batchDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/events/batch-delete
 * Batch delete events by IDs. Uses POST to reliably send a JSON body.
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
    const { ids } = batchDeleteSchema.parse(body);
    const pool = getPool();

    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
    const result = await pool.query(
      `DELETE FROM events WHERE wedding_id = $1 AND id IN (${placeholders}) RETURNING id`,
      [weddingId, ...ids]
    );

    return Response.json({ deleted: result.rowCount });
  } catch (error) {
    return handleApiError(error);
  }
}
