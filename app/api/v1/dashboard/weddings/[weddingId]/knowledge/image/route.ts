import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { handleApiError, AppError } from '@/lib/errors';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { uploadObject, getMediaUrl } from '@/lib/storage/r2';

const MAX_SIZE = 10_000_000; // 10 MB
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/knowledge/image
 *
 * Accepts a single image file via multipart/form-data (field name "file").
 * Uploads it to R2 and returns a public URL the couple can use as a home
 * card image. Max 10 MB, JPG/PNG/WebP/HEIC only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      throw new AppError('VALIDATION_ERROR', 'Missing "file" field');
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      throw new AppError(
        'UPLOAD_INVALID_TYPE',
        'Only JPG, PNG, WebP, and HEIC images are accepted.'
      );
    }

    if (file.size > MAX_SIZE) {
      throw new AppError('UPLOAD_TOO_LARGE', 'Home card images must be under 10 MB.');
    }

    const ext = EXT_MAP[file.type] || 'bin';
    const id = uuidv4();
    const key = `weddings/${weddingId}/home-cards/${id}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadObject(key, buffer, file.type);

    const url = await getMediaUrl(key);

    return Response.json({ data: { url, key } });
  } catch (error) {
    return handleApiError(error);
  }
}
