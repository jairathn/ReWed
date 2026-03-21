import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { AppError, handleApiError } from '@/lib/errors';

/**
 * POST /api/v1/w/[slug]/media/[uploadId]/favorite
 * Toggle favorite on an upload. Returns the new favorited state.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; uploadId: string }> }
) {
  try {
    const { slug, uploadId } = await params;
    const pool = getPool();

    const sessionToken = request.cookies.get('wedding_session')?.value;
    if (!sessionToken) throw new AppError('AUTH_NOT_REGISTERED');

    const session = await validateSession(pool, sessionToken);
    if (!session) throw new AppError('AUTH_TOKEN_EXPIRED');

    // Verify wedding
    const weddingResult = await pool.query(
      `SELECT id FROM weddings WHERE slug = $1`,
      [slug]
    );
    if (weddingResult.rows.length === 0) throw new AppError('WEDDING_NOT_FOUND');
    if (weddingResult.rows[0].id !== session.weddingId) throw new AppError('AUTH_NOT_REGISTERED');

    // Verify upload exists and belongs to this wedding
    const uploadResult = await pool.query(
      `SELECT id FROM uploads WHERE id = $1 AND wedding_id = $2 AND status = 'ready'`,
      [uploadId, session.weddingId]
    );
    if (uploadResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Upload not found');
    }

    // Toggle: try to insert, if exists then delete
    const existing = await pool.query(
      `SELECT id FROM favorites WHERE guest_id = $1 AND upload_id = $2`,
      [session.guestId, uploadId]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `DELETE FROM favorites WHERE guest_id = $1 AND upload_id = $2`,
        [session.guestId, uploadId]
      );
      return Response.json({ data: { favorited: false } });
    }

    await pool.query(
      `INSERT INTO favorites (wedding_id, guest_id, upload_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (guest_id, upload_id) DO NOTHING`,
      [session.weddingId, session.guestId, uploadId]
    );

    return Response.json({ data: { favorited: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
