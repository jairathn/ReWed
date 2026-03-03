import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const MAX_PHOTO_SIZE = 25_000_000; // 25MB
const MAX_VIDEO_SIZE = 500_000_000; // 500MB
const MULTIPART_THRESHOLD = 100_000_000; // 100MB
const PRESIGN_EXPIRY = 3600; // 1 hour

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucketName(): string {
  return process.env.R2_BUCKET_NAME || 'wedding-media';
}

function getPublicUrl(): string {
  return process.env.R2_PUBLIC_URL || 'https://media.yourplatform.com';
}

function getExtension(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/heic': 'heic',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };
  return map[contentType] || 'bin';
}

export interface PresignedUrlResult {
  url: string;
  key: string;
  expiresAt: Date;
  multipart?: boolean;
  uploadId?: string;
}

export async function generatePresignedPutUrl(params: {
  weddingId: string;
  uploadId: string;
  contentType: string;
  contentLength: number;
}): Promise<PresignedUrlResult> {
  const { weddingId, uploadId, contentType, contentLength } = params;

  // Validate file size
  const isVideo = contentType.startsWith('video/');
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_PHOTO_SIZE;
  if (contentLength > maxSize) {
    throw new Error(`File too large (max ${maxSize / 1_000_000}MB)`);
  }

  const now = new Date();
  const yearMonth = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ext = getExtension(contentType);
  const key = `weddings/${weddingId}/uploads/${yearMonth}/${uploadId}/original.${ext}`;

  // For large videos, use multipart upload
  if (contentLength > MULTIPART_THRESHOLD) {
    return {
      url: '', // Multipart uses different flow
      key,
      expiresAt: new Date(Date.now() + PRESIGN_EXPIRY * 1000),
      multipart: true,
      uploadId: `multipart-${uploadId}`,
    };
  }

  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });

  const url = await getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRY });

  return {
    url,
    key,
    expiresAt: new Date(Date.now() + PRESIGN_EXPIRY * 1000),
  };
}

export function getCdnUrl(storageKey: string): string {
  return `${getPublicUrl()}/${storageKey}`;
}

export function getThumbnailKey(originalKey: string): string {
  return originalKey.replace('/original.', '/thumbnail.');
}
