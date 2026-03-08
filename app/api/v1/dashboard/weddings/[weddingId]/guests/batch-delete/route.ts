import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const batchDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/guests/batch-delete
 * Batch delete guests by IDs. Uses POST to reliably send a JSON body.
 * Deletes in chunks of 500 to stay within PostgreSQL parameter limits.
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

    let totalDeleted = 0;
    const CHUNK_SIZE = 500;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map((_, j) => `$${j + 2}`).join(', ');
      const result = await pool.query(
        `DELETE FROM guests WHERE wedding_id = $1 AND id IN (${placeholders}) RETURNING id`,
        [weddingId, ...chunk]
      );
      totalDeleted += result.rowCount ?? 0;
    }

    return Response.json({ deleted: totalDeleted });
  } catch (error) {
    return handleApiError(error);
  }
}
