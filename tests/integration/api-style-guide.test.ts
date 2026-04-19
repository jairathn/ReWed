import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

vi.mock('@/lib/dashboard-auth', () => ({
  getCoupleId: vi.fn().mockReturnValue('c-1'),
  verifyWeddingOwnership: vi.fn().mockResolvedValue(undefined),
}));

const mockUploadObject = vi.fn().mockResolvedValue(undefined);
const mockDeleteObject = vi.fn().mockResolvedValue(undefined);
const mockGetMediaUrl = vi.fn().mockImplementation((key: string) => Promise.resolve(`https://cdn.example.com/${key}`));

vi.mock('@/lib/storage/r2', () => ({
  uploadObject: (...args: unknown[]) => mockUploadObject(...args),
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
  getMediaUrl: (key: string) => mockGetMediaUrl(key),
}));

import { GET, POST, DELETE } from '@/app/api/v1/dashboard/weddings/[weddingId]/events/[eventId]/style-guide/route';

function makeParams(weddingId = 'w-1', eventId = 'e-1') {
  return { params: Promise.resolve({ weddingId, eventId }) };
}

describe('Style guide images API', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockUploadObject.mockClear();
    mockDeleteObject.mockClear();
    mockGetMediaUrl.mockClear();
    mockGetMediaUrl.mockImplementation((key: string) => Promise.resolve(`https://cdn.example.com/${key}`));
  });

  it('GET returns images with resolved URLs', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ style_guide_images: ['weddings/w-1/style-guide/e-1/abc.jpg', 'weddings/w-1/style-guide/e-1/def.png'] }],
    });

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/events/e-1/style-guide');
    const res = await GET(req, makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.images).toHaveLength(2);
    expect(body.data.images[0].storage_key).toBe('weddings/w-1/style-guide/e-1/abc.jpg');
    expect(body.data.images[0].url).toContain('cdn.example.com');
    expect(mockGetMediaUrl).toHaveBeenCalledTimes(2);
  });

  it('POST uploads a file and adds to array', async () => {
    // Event lookup — 0 existing images
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'e-1', style_guide_images: [] }],
    });
    // Update query
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const file = new File([new Uint8Array(100)], 'outfit.jpg', { type: 'image/jpeg' });
    const form = new FormData();
    form.append('file', file);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/dashboard/weddings/w-1/events/e-1/style-guide',
      { method: 'POST', body: form }
    );

    const res = await POST(req, makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.storage_key).toMatch(/^weddings\/w-1\/style-guide\/e-1\/.+\.jpg$/);
    expect(body.data.url).toBeDefined();
    expect(mockUploadObject).toHaveBeenCalledTimes(1);
  });

  it('POST rejects when at max images', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'e-1', style_guide_images: ['a', 'b', 'c', 'd', 'e'] }],
    });

    const file = new File([new Uint8Array(100)], 'outfit.jpg', { type: 'image/jpeg' });
    const form = new FormData();
    form.append('file', file);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/dashboard/weddings/w-1/events/e-1/style-guide',
      { method: 'POST', body: form }
    );

    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
    expect(mockUploadObject).not.toHaveBeenCalled();
  });

  it('DELETE removes image from array and deletes from R2', async () => {
    const key = 'weddings/w-1/style-guide/e-1/abc.jpg';
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'e-1', style_guide_images: [key, 'other.jpg'] }],
    });
    // Update query
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/dashboard/weddings/w-1/events/e-1/style-guide',
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_key: key }),
      }
    );

    const res = await DELETE(req, makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.deleted).toBe(true);
    expect(mockDeleteObject).toHaveBeenCalledWith(key);

    // Verify the update query removed only the specified key
    const updateCall = mockQuery.mock.calls[1];
    const updatedArray = JSON.parse(updateCall[1][0] as string);
    expect(updatedArray).toEqual(['other.jpg']);
  });
});
