import QRCode from 'qrcode';

/**
 * Generate a QR code PNG buffer for a wedding's guest sign-in page.
 */
export async function generateWeddingQrCode(slug: string): Promise<Buffer> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const guestUrl = `${appUrl}/w/${slug}`;

  const buffer = await QRCode.toBuffer(guestUrl, {
    type: 'png',
    width: 1024,
    margin: 2,
    color: { dark: '#2B2B2B', light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  });

  return buffer;
}

/**
 * Generate a QR code as a data URL (for inline embedding).
 */
export async function generateWeddingQrDataUrl(slug: string): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const guestUrl = `${appUrl}/w/${slug}`;

  return QRCode.toDataURL(guestUrl, {
    width: 512,
    margin: 2,
    color: { dark: '#2B2B2B', light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  });
}

/**
 * Upload the QR code PNG to R2 storage and return the storage key.
 */
export async function uploadQrCodeToR2(weddingId: string, pngBuffer: Buffer): Promise<string> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured');
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const bucketName = process.env.R2_BUCKET_NAME || 'wedding-media';
  const key = `weddings/${weddingId}/qr-code.png`;

  await client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: pngBuffer,
    ContentType: 'image/png',
    CacheControl: 'public, max-age=31536000',
  }));

  return key;
}
