import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { uploadObject, deleteObject, getMediaUrl } from '@/lib/storage/r2';

const MAX_FILE_SIZE = 10_000_000; // 10MB
const MAX_IMAGES_PER_EVENT = 5;

/**
 * GET — list current style guide images with resolved URLs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; eventId: string }> }
) {
  try {
    const { weddingId, eventId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    const result = await pool.query(
      `SELECT COALESCE(style_guide_images, '[]'::jsonb) AS style_guide_images
       FROM events WHERE id = $1 AND wedding_id = $2`,
      [eventId, weddingId]
    );
    if (result.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND', 'Event not found');
    }

    const keys: string[] = result.rows[0].style_guide_images || [];
    const images = await Promise.all(
      keys.map(async (key) => {
        const url = await getMediaUrl(key).catch(() => '');
        return { storage_key: key, url };
      })
    );

    return Response.json({ data: { images: images.filter((i) => i.url) } });
  } catch (error) {
    return handleApiError(error);
  }
}

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/**
 * POST — upload a style guide image for an event.
 * Accepts multipart form with a single "file" field.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; eventId: string }> }
) {
  try {
    const { weddingId, eventId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();

    const eventResult = await pool.query(
      `SELECT id, style_guide_images FROM events WHERE id = $1 AND wedding_id = $2`,
      [eventId, weddingId]
    );
    if (eventResult.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND', 'Event not found');
    }

    const existing: string[] = eventResult.rows[0].style_guide_images || [];
    if (existing.length >= MAX_IMAGES_PER_EVENT) {
      throw new AppError('VALIDATION_ERROR', `Maximum ${MAX_IMAGES_PER_EVENT} style guide images per event`);
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      throw new AppError('VALIDATION_ERROR', 'No file provided');
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      throw new AppError('VALIDATION_ERROR', 'Only JPEG, PNG, WebP, and HEIC images are allowed');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new AppError('VALIDATION_ERROR', 'File must be under 10MB');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileId = randomUUID();
    const storageKey = `weddings/${weddingId}/style-guide/${eventId}/${fileId}.${ext}`;

    await uploadObject(storageKey, buffer, file.type);

    const updated = [...existing, storageKey];
    await pool.query(
      `UPDATE events SET style_guide_images = $1 WHERE id = $2`,
      [JSON.stringify(updated), eventId]
    );

    const url = await getMediaUrl(storageKey);

    return Response.json({ data: { storage_key: storageKey, url } });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE — remove a style guide image by storage key.
 * Body: { storage_key: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; eventId: string }> }
) {
  try {
    const { weddingId, eventId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const storageKey = typeof body.storage_key === 'string' ? body.storage_key : '';
    if (!storageKey) {
      throw new AppError('VALIDATION_ERROR', 'storage_key is required');
    }

    const pool = getPool();
    const eventResult = await pool.query(
      `SELECT id, style_guide_images FROM events WHERE id = $1 AND wedding_id = $2`,
      [eventId, weddingId]
    );
    if (eventResult.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND', 'Event not found');
    }

    const existing: string[] = eventResult.rows[0].style_guide_images || [];
    const updated = existing.filter((k) => k !== storageKey);

    await pool.query(
      `UPDATE events SET style_guide_images = $1 WHERE id = $2`,
      [JSON.stringify(updated), eventId]
    );

    try {
      await deleteObject(storageKey);
    } catch {
      // Non-fatal — image may already be gone
    }

    return Response.json({ data: { deleted: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
