import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { handleApiError, AppError } from '@/lib/errors';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; songId: string }> }
) {
  try {
    const { slug, songId } = await params;
    const pool = getPool();

    const sessionToken = request.cookies.get('wedding_session')?.value;
    if (!sessionToken) throw new AppError('AUTH_NOT_REGISTERED');

    const session = await validateSession(pool, sessionToken);
    if (!session) throw new AppError('AUTH_TOKEN_EXPIRED');

    await pool.query(
      `DELETE FROM music_requests WHERE id = $1 AND wedding_id = $2 AND guest_id = $3`,
      [songId, session.weddingId, session.guestId]
    );

    return Response.json({ data: { deleted: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
