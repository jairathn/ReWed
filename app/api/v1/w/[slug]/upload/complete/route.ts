import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { getMediaUrl, getThumbnailKey, getObject, uploadObject } from '@/lib/storage/r2';
import { generateThumbnail } from '@/lib/media/photo-processor';
import { AppError, handleApiError } from '@/lib/errors';

const completeSchema = z.object({
  upload_id: z.string().uuid(),
  storage_key: z.string().min(1),
  filter_applied: z.string().max(100).optional(),
  prompt_answered: z.string().max(500).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration_ms: z.number().int().positive().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await params;
    const pool = getPool();

    // Validate guest session
    const sessionToken = request.cookies.get('wedding_session')?.value;
    if (!sessionToken) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    const session = await validateSession(pool, sessionToken);
    if (!session) {
      throw new AppError('AUTH_TOKEN_EXPIRED');
    }

    // Validate request body
    const body = await request.json();
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }

    const { upload_id, storage_key, filter_applied, prompt_answered, width, height, duration_ms } = parsed.data;

    // Verify the upload belongs to this guest and wedding
    const uploadResult = await pool.query(
      `SELECT id, wedding_id, guest_id, status FROM uploads WHERE id = $1`,
      [upload_id]
    );

    if (uploadResult.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Upload not found');
    }

    const upload = uploadResult.rows[0];
    if (upload.wedding_id !== session.weddingId || upload.guest_id !== session.guestId) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    if (upload.status === 'ready') {
      throw new AppError('VALIDATION_ERROR', 'Upload already completed');
    }

    // Generate thumbnail key
    const thumbnailKey = getThumbnailKey(storage_key);

    // Generate and upload thumbnail for photos
    const isPhoto = !duration_ms; // videos have duration_ms
    if (isPhoto) {
      try {
        const original = await getObject(storage_key);
        const thumbnailBuffer = await generateThumbnail(original);
        await uploadObject(thumbnailKey, thumbnailBuffer, 'image/webp');
      } catch (err) {
        console.warn('[upload-complete] Thumbnail generation failed, using original:', err);
      }
    }

    // Update upload to ready status
    const result = await pool.query(
      `UPDATE uploads
       SET status = 'ready',
           storage_key = $1,
           thumbnail_key = $2,
           filter_applied = $3,
           prompt_answered = $4,
           width = $5,
           height = $6,
           duration_ms = $7
       WHERE id = $8
       RETURNING *`,
      [storage_key, thumbnailKey, filter_applied || null, prompt_answered || null, width || null, height || null, duration_ms || null, upload_id]
    );

    const updated = result.rows[0];

    // Update wedding storage usage
    await pool.query(
      `UPDATE weddings SET storage_used_bytes = storage_used_bytes + $1 WHERE id = $2`,
      [updated.size_bytes || 0, session.weddingId]
    );

    return Response.json({
      data: {
        upload: {
          id: updated.id,
          type: updated.type,
          url: await getMediaUrl(updated.storage_key),
          thumbnail_url: await getMediaUrl(thumbnailKey),
          status: updated.status,
          created_at: updated.created_at,
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
