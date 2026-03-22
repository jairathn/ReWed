import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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
    forcePathStyle: true,
  });
}

function getBucketName(): string {
  return process.env.R2_BUCKET_NAME || 'wedding-media';
}

function getPublicUrl(): string | null {
  return process.env.R2_PUBLIC_URL || null;
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

/** Convert a name to a filesystem-safe slug */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';
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
  guestName?: string;
  eventName?: string;
}): Promise<PresignedUrlResult> {
  const { weddingId, uploadId, contentType, contentLength, guestName, eventName } = params;

  // Validate file size
  const isVideo = contentType.startsWith('video/');
  const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_PHOTO_SIZE;
  if (contentLength > maxSize) {
    throw new Error(`File too large (max ${maxSize / 1_000_000}MB)`);
  }

  const ext = getExtension(contentType);

  // Build guest/event folder structure
  const guestFolder = guestName ? slugify(guestName) : 'unknown-guest';
  const eventFolder = eventName ? slugify(eventName) : 'pre-wedding';
  const key = `weddings/${weddingId}/by-guest/${guestFolder}/${eventFolder}/${uploadId}.${ext}`;

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

export async function generatePresignedGetUrl(storageKey: string): Promise<string> {
  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
    ResponseContentDisposition: `attachment; filename="${storageKey.split('/').pop()}"`,
  });
  return getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRY });
}

export async function uploadObject(storageKey: string, body: Buffer, contentType: string): Promise<void> {
  const client = getR2Client();
  await client.send(new PutObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
    Body: body,
    ContentType: contentType,
  }));
}

export async function getObject(storageKey: string): Promise<Buffer> {
  const client = getR2Client();
  const response = await client.send(new GetObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
  }));
  const bytes = await response.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteObject(storageKey: string): Promise<void> {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
  }));
}

export function getCdnUrl(storageKey: string): string | null {
  const publicUrl = getPublicUrl();
  if (!publicUrl) return null;
  return `${publicUrl}/${storageKey}`;
}

export async function getMediaUrl(storageKey: string): Promise<string> {
  const cdnUrl = getCdnUrl(storageKey);
  if (cdnUrl) return cdnUrl;
  // Fall back to presigned URL when R2_PUBLIC_URL is not configured
  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: storageKey,
  });
  return getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRY });
}

export function getThumbnailKey(originalKey: string): string {
  // Insert /thumbnail before the file extension
  const lastDot = originalKey.lastIndexOf('.');
  if (lastDot === -1) return `${originalKey}-thumbnail`;
  return `${originalKey.substring(0, lastDot)}-thumbnail${originalKey.substring(lastDot)}`;
}
