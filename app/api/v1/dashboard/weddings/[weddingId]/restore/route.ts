import { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

const restoreSchema = z.object({
  kind: z.enum(['todo', 'meeting', 'guest', 'vendor', 'timeline_entry']),
  id: z.string().uuid(),
});

// The set of tables we'll restore from. Keyed by `kind` for safety — we never
// concatenate raw user input into the table name.
const KIND_TO_TABLE: Record<z.infer<typeof restoreSchema>['kind'], string> = {
  todo: 'todos',
  meeting: 'meetings',
  guest: 'guests',
  vendor: 'vendors',
  timeline_entry: 'timeline_entries',
};

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/restore
 *
 * Clears `soft_deleted_at` on a single row that was previously soft-deleted.
 * Backs the "Undo" button on UndoToast. One endpoint serves all five tables
 * we soft-delete from.
 *
 * Body: { kind: 'todo' | 'meeting' | 'guest' | 'vendor' | 'timeline_entry', id: uuid }
 *
 * Verifies the row belongs to the calling couple's wedding before touching
 * it. Returns 404 if the row doesn't exist, isn't soft-deleted, or belongs
 * to a different wedding — these all look the same to the client on purpose.
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
    const { kind, id } = restoreSchema.parse(body);
    const table = KIND_TO_TABLE[kind];

    const pool = getPool();
    const result = await pool.query(
      `UPDATE ${table}
         SET soft_deleted_at = NULL
       WHERE id = $1
         AND wedding_id = $2
         AND soft_deleted_at IS NOT NULL
       RETURNING id`,
      [id, weddingId]
    );

    if (result.rowCount === 0) {
      throw new AppError('VALIDATION_ERROR', 'Nothing to restore — already gone or never deleted.');
    }
    return Response.json({ data: { ok: true, kind, id } });
  } catch (error) {
    return handleApiError(error);
  }
}
