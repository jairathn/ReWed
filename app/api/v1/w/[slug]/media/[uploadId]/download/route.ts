import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { generatePresignedGetUrl } from '@/lib/storage/r2';
import { AppError, handleApiError } from '@/lib/errors';

/**
 * GET /api/v1/w/[slug]/media/[uploadId]/download
 * Returns a presigned download URL for the original file.
 */
export async function GET(
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

    // Get upload — guests can download their own uploads
    const uploadResult = await pool.query(
      `SELECT storage_key FROM uploads
       WHERE id = $1 AND guest_id = $2 AND wedding_id = $3 AND status = 'ready'`,
      [uploadId, session.guestId, session.weddingId]
    );
    if (uploadResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Upload not found');
    }

    const downloadUrl = await generatePresignedGetUrl(uploadResult.rows[0].storage_key);

    return Response.json({ data: { download_url: downloadUrl } });
  } catch (error) {
    return handleApiError(error);
  }
}
