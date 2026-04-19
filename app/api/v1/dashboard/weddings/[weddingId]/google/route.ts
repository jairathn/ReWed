import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { isGoogleConfigured } from '@/lib/google/oauth';

/**
 * GET — return current Google connection status (for the dashboard card).
 * DELETE — disconnect: drop tokens. Couple can reconnect later.
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
      `SELECT email, gmail_enabled, drive_enabled, last_scanned_at, last_drive_scanned_at,
              connected_at
       FROM google_connections WHERE wedding_id = $1`,
      [weddingId]
    );

    return Response.json({
      data: {
        configured: isGoogleConfigured(),
        connected: result.rows.length > 0,
        connection: result.rows[0] || null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    await pool.query(
      `DELETE FROM google_connections WHERE wedding_id = $1`,
      [weddingId]
    );
    return Response.json({ data: { ok: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
