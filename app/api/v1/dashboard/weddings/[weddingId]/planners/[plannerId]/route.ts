import { NextRequest } from 'next/server';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

async function ensurePlannerOwned(weddingId: string, plannerId: string) {
  const pool = getPool();
  const row = await pool.query(
    `SELECT id FROM planner_access WHERE id = $1 AND wedding_id = $2`,
    [plannerId, weddingId]
  );
  if (row.rows.length === 0) throw new AppError('WEDDING_NOT_FOUND');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; plannerId: string }> }
) {
  try {
    const { weddingId, plannerId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);
    await ensurePlannerOwned(weddingId, plannerId);

    const pool = getPool();
    // Soft-revoke so any active planner JWT immediately stops working
    // (requireWeddingAccess re-checks the row on every request).
    await pool.query(
      `UPDATE planner_access SET revoked_at = NOW() WHERE id = $1`,
      [plannerId]
    );
    return Response.json({ data: { id: plannerId } });
  } catch (error) {
    return handleApiError(error);
  }
}
