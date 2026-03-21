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
    console.log('[presign] Starting presign for slug:', slug);
    const pool = getPool();

    // Validate guest session
    const sessionToken = request.cookies.get('wedding_session')?.value;
    if (!sessionToken) {
      console.log('[presign] No session token found');
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    const session = await validateSession(pool, sessionToken);
    if (!session) {
      console.log('[presign] Session validation failed');
      throw new AppError('AUTH_TOKEN_EXPIRED');
    }
    console.log('[presign] Session valid, guestId:', session.guestId, 'weddingId:', session.weddingId);

    // Verify wedding slug matches session
    const weddingResult = await pool.query(
      `SELECT id, status, timezone FROM weddings WHERE slug = $1`,
      [slug]
    );
    if (weddingResult.rows.length === 0) {
      console.log('[presign] Wedding not found for slug:', slug);
      throw new AppError('WEDDING_NOT_FOUND');
    }
    const wedding = weddingResult.rows[0];
    if (wedding.id !== session.weddingId) {
      console.log('[presign] Wedding ID mismatch:', wedding.id, '!==', session.weddingId);
      throw new AppError('AUTH_NOT_REGISTERED');
    }
    if (wedding.status === 'archived') {
      throw new AppError('WEDDING_INACTIVE');
    }

    // Validate request body
    const body = await request.json();
    console.log('[presign] Request body:', JSON.stringify(body));
    const parsed = uploadPresignSchema.safeParse(body);
    if (!parsed.success) {
      console.log('[presign] Validation failed:', parsed.error.issues);
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }

    const { type, mime_type, size_bytes, event_id } = parsed.data;
    console.log('[presign] Parsed:', { type, mime_type, size_bytes, event_id });

    // Get guest name for folder structure
    const guestResult = await pool.query(
      `SELECT display_name FROM guests WHERE id = $1`,
      [session.guestId]
    );
    const guestName = guestResult.rows[0]?.display_name || 'unknown-guest';
    console.log('[presign] Guest name:', guestName);

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
    console.log('[presign] Upload ID:', uploadId, 'eventName:', eventName, 'resolvedEventId:', resolvedEventId);

    // Create upload record in pending state
    await pool.query(
      `INSERT INTO uploads (id, wedding_id, guest_id, event_id, type, storage_key, mime_type, size_bytes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [uploadId, session.weddingId, session.guestId, resolvedEventId, type, '', mime_type, size_bytes]
    );
    console.log('[presign] Upload record created');

    // Generate presigned URL with guest/event folder structure
    const presigned = await generatePresignedPutUrl({
      weddingId: session.weddingId,
      uploadId,
      contentType: mime_type,
      contentLength: size_bytes,
      guestName,
      eventName: eventName || undefined,
    });
    console.log('[presign] Presigned URL generated, key:', presigned.key, 'url starts with:', presigned.url.substring(0, 80));

    // Update upload with storage key
    await pool.query(
      `UPDATE uploads SET storage_key = $1, status = 'uploading' WHERE id = $2`,
      [presigned.key, uploadId]
    );

    console.log('[presign] Success — returning presigned URL');
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
    console.error('[presign] ERROR:', error);
    return handleApiError(error);
  }
}
