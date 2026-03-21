import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { deleteObject } from '@/lib/storage/r2';
import { AppError, handleApiError } from '@/lib/errors';

/**
 * DELETE /api/v1/w/[slug]/media/[uploadId]
 * Delete a guest's own upload.
 */
export async function DELETE(
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

    // Verify upload belongs to this guest
    const uploadResult = await pool.query(
      `SELECT id, storage_key, thumbnail_key, size_bytes
       FROM uploads WHERE id = $1 AND guest_id = $2 AND wedding_id = $3`,
      [uploadId, session.guestId, session.weddingId]
    );
    if (uploadResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Upload not found or not yours');
    }

    const upload = uploadResult.rows[0];

    // Delete from R2
    try {
      await deleteObject(upload.storage_key);
      if (upload.thumbnail_key) {
        await deleteObject(upload.thumbnail_key);
      }
    } catch {
      // Continue even if R2 delete fails — still remove DB record
    }

    // Delete favorites referencing this upload
    await pool.query('DELETE FROM favorites WHERE upload_id = $1', [uploadId]);

    // Delete upload record
    await pool.query('DELETE FROM uploads WHERE id = $1', [uploadId]);

    // Update storage usage
    if (upload.size_bytes) {
      await pool.query(
        `UPDATE weddings SET storage_used_bytes = GREATEST(0, storage_used_bytes - $1) WHERE id = $2`,
        [upload.size_bytes, session.weddingId]
      );
    }

    return Response.json({ data: { deleted: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
