import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { handleApiError, AppError } from '@/lib/errors';
import { requireWeddingAccess } from '@/lib/dashboard-auth';
import { uploadObject, getCdnUrl, getMediaUrl } from '@/lib/storage/r2';

/**
 * POST /api/v1/uploads/image
 *
 * Inline image upload for the rich-text editor. Couples + planners can paste
 * or drag images directly into FAQ answers, schedule descriptions, etc.
 *
 *  - multipart/form-data with one `image` file field and a `wedding_id` field
 *  - JPEG / PNG / WebP only; HEIC is rejected with a friendly message (sharp
 *    can't decode HEIC without libheif which Vercel's runtime doesn't ship —
 *    revisit when usage data shows the rejection rate is meaningful)
 *  - max 10MB raw; sharp re-encodes to webp at quality 85, max 2000px on the
 *    long edge, EXIF stripped (privacy — wedding photos often carry GPS)
 *  - stored at weddings/{wedding_id}/rich-text/{uuid}.webp in the existing
 *    R2 bucket; CDN URL returned for embedding inline
 */

const MAX_BYTES = 10_000_000; // 10 MB
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const HEIC_TYPES = new Set(['image/heic', 'image/heif']);

export async function POST(request: NextRequest) {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError('VALIDATION_ERROR', 'Could not read upload body.');
    }

    const weddingId = form.get('wedding_id');
    const file = form.get('image');
    if (typeof weddingId !== 'string' || !weddingId) {
      throw new AppError('VALIDATION_ERROR', 'wedding_id is required.');
    }
    if (!(file instanceof File)) {
      throw new AppError('VALIDATION_ERROR', 'image is required.');
    }

    await requireWeddingAccess(request, weddingId);

    const mime = file.type || 'application/octet-stream';
    if (HEIC_TYPES.has(mime)) {
      throw new AppError(
        'UPLOAD_INVALID_TYPE',
        'HEIC photos aren’t supported yet — convert to JPG first, or upload from desktop.'
      );
    }
    if (!ACCEPTED_TYPES.has(mime)) {
      throw new AppError(
        'UPLOAD_INVALID_TYPE',
        'We accept JPG, PNG, and WebP images.'
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      throw new AppError('UPLOAD_TOO_LARGE', 'Image is too large (max 10MB).');
    }
    const input = Buffer.from(arrayBuffer);

    // Transcode: auto-rotate from EXIF, strip the rest, cap long edge, encode
    // webp. Output is what we actually serve; original never leaves the
    // request handler.
    const transformed = await sharp(input)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });

    const key = `weddings/${weddingId}/rich-text/${randomUUID()}.webp`;
    await uploadObject(key, transformed.data, 'image/webp');

    // Prefer the public CDN URL if the bucket has one; fall back to a
    // presigned GET that expires in an hour (callers can re-resolve via
    // /api/v1/uploads/image/url?key=… later if we want; not in this PR).
    const cdn = getCdnUrl(key);
    const url = cdn ?? (await getMediaUrl(key));

    return Response.json({
      data: {
        url,
        key,
        width: transformed.info.width,
        height: transformed.info.height,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// Vercel allows up to ~4.5MB on JSON bodies by default but multipart can be
// larger. The runtime cap on this route — set explicitly so we don't 413
// before our own MAX_BYTES check fires.
export const maxDuration = 30;
