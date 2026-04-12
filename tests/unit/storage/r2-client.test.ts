import { describe, it, expect } from 'vitest';

describe('R2 Client', () => {
  it('generates presigned URL with correct key structure', async () => {
    const { generatePresignedPutUrl } = await import('@/lib/storage/r2');

    const result = await generatePresignedPutUrl({
      weddingId: '550e8400-e29b-41d4-a716-446655440000',
      uploadId: '660e8400-e29b-41d4-a716-446655440001',
      contentType: 'image/jpeg',
      contentLength: 1024000,
    });

    expect(result.key).toMatch(/^weddings\/550e8400.*\/uploads\/\d{4}\/\d{2}\/660e8400.*\/original\.jpg$/);
    expect(result.url).toBeDefined();
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('rejects files over size limit', async () => {
    const { generatePresignedPutUrl } = await import('@/lib/storage/r2');

    await expect(
      generatePresignedPutUrl({
        weddingId: 'test',
        uploadId: 'test',
        contentType: 'video/mp4',
        contentLength: 600_000_000,
      })
    ).rejects.toThrow('File too large');
  });

  it('uses multipart for videos over 100MB', async () => {
    const { generatePresignedPutUrl } = await import('@/lib/storage/r2');

    const result = await generatePresignedPutUrl({
      weddingId: 'test',
      uploadId: 'test',
      contentType: 'video/mp4',
      contentLength: 150_000_000,
    });

    expect(result.multipart).toBe(true);
    expect(result.uploadId).toBeDefined();
  });

  it('generates CDN URL from storage key', async () => {
    const { getCdnUrl } = await import('@/lib/storage/r2');

    const url = getCdnUrl('weddings/test/uploads/2026/01/test/original.jpg');
    expect(url).toContain('weddings/test/uploads/2026/01/test/original.jpg');
  });
});
