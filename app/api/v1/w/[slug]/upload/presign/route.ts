import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { generatePresignedPutUrl } from '@/lib/storage/r2';
import { uploadPresignSchema } from '@/lib/validation';
import { AppError, handleApiError } from '@/lib/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
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

    // Verify wedding slug matches session
    const weddingResult = await pool.query(
      `SELECT id, status FROM weddings WHERE slug = $1`,
      [slug]
    );
    if (weddingResult.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND');
    }
    const wedding = weddingResult.rows[0];
    if (wedding.id !== session.weddingId) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }
    if (wedding.status === 'archived') {
      throw new AppError('WEDDING_INACTIVE');
    }

    // Validate request body
    const body = await request.json();
    const parsed = uploadPresignSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }

    const { type, mime_type, size_bytes, event_id } = parsed.data;

    // If event_id provided, verify it belongs to this wedding
    if (event_id) {
      const eventResult = await pool.query(
        `SELECT id FROM events WHERE id = $1 AND wedding_id = $2`,
        [event_id, session.weddingId]
      );
      if (eventResult.rows.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Event not found');
      }
    }

    const uploadId = uuidv4();

    // Create upload record in pending state
    await pool.query(
      `INSERT INTO uploads (id, wedding_id, guest_id, event_id, type, storage_key, mime_type, size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [uploadId, session.weddingId, session.guestId, event_id || null, type, '', mime_type, size_bytes]
    );

    // Generate presigned URL
    const presigned = await generatePresignedPutUrl({
      weddingId: session.weddingId,
      uploadId,
      contentType: mime_type,
      contentLength: size_bytes,
    });

    // Update upload with storage key
    await pool.query(
      `UPDATE uploads SET storage_key = $1, status = 'uploading' WHERE id = $2`,
      [presigned.key, uploadId]
    );

    return Response.json({
      data: {
        upload_id: uploadId,
        presigned_url: presigned.url,
        storage_key: presigned.key,
        expires_at: presigned.expiresAt.toISOString(),
        multipart: presigned.multipart || false,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
