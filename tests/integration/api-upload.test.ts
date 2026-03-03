import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock database
const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockRelease = vi.fn();
const mockClientQuery = vi.fn();

vi.mock('@/lib/db/client', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: mockConnect,
  }),
}));

// Mock session validation
vi.mock('@/lib/session', () => ({
  validateSession: vi.fn().mockResolvedValue({
    sessionId: 's-001',
    weddingId: 'w-001',
    guestId: 'g-001',
  }),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: () => 'upload-001',
}));

import { POST as presignHandler } from '@/app/api/v1/w/[slug]/upload/presign/route';
import { POST as completeHandler } from '@/app/api/v1/w/[slug]/upload/complete/route';

function makeRequest(body: unknown, slug = 'neil-shriya') {
  return new NextRequest(`http://localhost:3000/api/v1/w/${slug}/upload/presign`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'wedding_session=valid-token',
    },
  });
}

function makeParams(slug = 'neil-shriya') {
  return { params: Promise.resolve({ slug }) };
}

describe('POST /api/v1/w/[slug]/upload/presign', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns presigned URL for a valid photo upload', async () => {
    // Mock wedding lookup
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001', status: 'active' }] }) // wedding
      .mockResolvedValueOnce({ rows: [] }) // insert upload
      .mockResolvedValueOnce({ rows: [] }); // update storage key

    const response = await presignHandler(
      makeRequest({
        type: 'photo',
        mime_type: 'image/jpeg',
        size_bytes: 1024000,
      }),
      makeParams()
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.upload_id).toBe('upload-001');
    expect(body.data.presigned_url).toBeDefined();
    expect(body.data.storage_key).toContain('weddings/w-001');
    expect(body.data.expires_at).toBeDefined();
    expect(body.data.multipart).toBe(false);
  });

  it('returns 401 without session cookie', async () => {
    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/upload/presign', {
      method: 'POST',
      body: JSON.stringify({ type: 'photo', mime_type: 'image/jpeg', size_bytes: 1024 }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await presignHandler(request, makeParams());
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid mime type', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'w-001', status: 'active' }] });

    const response = await presignHandler(
      makeRequest({
        type: 'photo',
        mime_type: 'application/pdf',
        size_bytes: 1024,
      }),
      makeParams()
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 for file over size limit', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'w-001', status: 'active' }] });

    const response = await presignHandler(
      makeRequest({
        type: 'video',
        mime_type: 'video/mp4',
        size_bytes: 600_000_000,
      }),
      makeParams()
    );

    expect(response.status).toBe(400);
  });

  it('indicates multipart for large video uploads', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001', status: 'active' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await presignHandler(
      makeRequest({
        type: 'video',
        mime_type: 'video/mp4',
        size_bytes: 150_000_000,
      }),
      makeParams()
    );

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.multipart).toBe(true);
  });

  it('returns 404 for non-existent wedding', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no wedding

    const response = await presignHandler(
      makeRequest({
        type: 'photo',
        mime_type: 'image/jpeg',
        size_bytes: 1024,
      }),
      makeParams('no-wedding')
    );

    expect(response.status).toBe(404);
  });
});

const UPLOAD_UUID = '660e8400-e29b-41d4-a716-446655440001';

describe('POST /api/v1/w/[slug]/upload/complete', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('marks upload as ready and returns media info', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: UPLOAD_UUID, wedding_id: 'w-001', guest_id: 'g-001', status: 'uploading' }],
      }) // find upload
      .mockResolvedValueOnce({
        rows: [{
          id: UPLOAD_UUID,
          type: 'photo',
          storage_key: `weddings/w-001/uploads/2026/03/${UPLOAD_UUID}/original.jpg`,
          thumbnail_key: `weddings/w-001/uploads/2026/03/${UPLOAD_UUID}/thumbnail.jpg`,
          size_bytes: 1024000,
          status: 'ready',
          created_at: new Date().toISOString(),
        }],
      }) // update upload
      .mockResolvedValueOnce({ rows: [] }); // update wedding storage

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/upload/complete', {
      method: 'POST',
      body: JSON.stringify({
        upload_id: UPLOAD_UUID,
        storage_key: `weddings/w-001/uploads/2026/03/${UPLOAD_UUID}/original.jpg`,
      }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await completeHandler(request, makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.upload.id).toBe(UPLOAD_UUID);
    expect(body.data.upload.status).toBe('ready');
    expect(body.data.upload.url).toContain('original.jpg');
  });

  it('rejects upload that does not belong to guest', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: UPLOAD_UUID, wedding_id: 'w-other', guest_id: 'g-other', status: 'uploading' }],
    });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/upload/complete', {
      method: 'POST',
      body: JSON.stringify({
        upload_id: UPLOAD_UUID,
        storage_key: 'weddings/w-001/uploads/test/original.jpg',
      }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await completeHandler(request, makeParams());
    expect(response.status).toBe(401);
  });

  it('rejects already-completed upload', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: UPLOAD_UUID, wedding_id: 'w-001', guest_id: 'g-001', status: 'ready' }],
    });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/upload/complete', {
      method: 'POST',
      body: JSON.stringify({
        upload_id: UPLOAD_UUID,
        storage_key: 'weddings/w-001/uploads/test/original.jpg',
      }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await completeHandler(request, makeParams());
    expect(response.status).toBe(400);
  });
});
