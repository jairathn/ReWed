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
      `SELECT id, status, timezone FROM weddings WHERE slug = $1`,
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

    // Get guest name for folder structure
    const guestResult = await pool.query(
      `SELECT display_name FROM guests WHERE id = $1`,
      [session.guestId]
    );
    const guestName = guestResult.rows[0]?.display_name || 'unknown-guest';

    // Determine event name for folder structure
    let eventName: string | null = null;
    let resolvedEventId = event_id || null;

    if (event_id) {
      // Explicit event_id provided — verify and get name
      const eventResult = await pool.query(
        `SELECT id, name FROM events WHERE id = $1 AND wedding_id = $2`,
        [event_id, session.weddingId]
      );
      if (eventResult.rows.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Event not found');
      }
      eventName = eventResult.rows[0].name;
    } else {
      // Auto-detect current event based on date/time
      const tz = wedding.timezone || 'UTC';
      try {
        const detected = await pool.query(
          `SELECT id, name FROM events
           WHERE wedding_id = $1
             AND date IS NOT NULL AND start_time IS NOT NULL
             AND (date + start_time) <= (NOW() AT TIME ZONE $2)
           ORDER BY date DESC, start_time DESC
           LIMIT 1`,
          [session.weddingId, tz]
        );
        if (detected.rows.length > 0) {
          resolvedEventId = detected.rows[0].id;
          eventName = detected.rows[0].name;
        }
      } catch {
        // Event detection is best-effort; don't block the upload
      }
      // If no event has started yet, eventName stays null → "pre-wedding" folder
    }

    const uploadId = uuidv4();

    // Create upload record in pending state
    await pool.query(
      `INSERT INTO uploads (id, wedding_id, guest_id, event_id, type, storage_key, mime_type, size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [uploadId, session.weddingId, session.guestId, resolvedEventId, type, '', mime_type, size_bytes]
    );

    // Generate presigned URL with guest/event folder structure
    const presigned = await generatePresignedPutUrl({
      weddingId: session.weddingId,
      uploadId,
      contentType: mime_type,
      contentLength: size_bytes,
      guestName,
      eventName: eventName || undefined,
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
