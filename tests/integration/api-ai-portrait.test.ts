import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockRelease = vi.fn();
const mockClientQuery = vi.fn();

vi.mock('@/lib/db/client', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    }),
  }),
}));

vi.mock('@/lib/session', () => ({
  validateSession: vi.fn().mockResolvedValue({
    sessionId: 's-001',
    weddingId: 'w-001',
    guestId: 'g-001',
  }),
}));

vi.mock('uuid', () => ({
  v4: () => 'job-001',
}));

import { POST } from '@/app/api/v1/w/[slug]/ai-portrait/route';
import { GET } from '@/app/api/v1/w/[slug]/ai-portrait/[jobId]/route';

function makeParams(slug = 'neil-shriya') {
  return { params: Promise.resolve({ slug }) };
}

function makeJobParams(slug = 'neil-shriya', jobId = 'job-001') {
  return { params: Promise.resolve({ slug, jobId }) };
}

describe('POST /api/v1/w/[slug]/ai-portrait', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockConnect.mockReset();
    mockRelease.mockReset();

    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    });
  });

  it('queues a portrait generation job', async () => {
    // Wedding lookup
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'w-001', package_config: { ai_portraits_per_guest: 5 }, status: 'active' }],
    });

    // Client queries inside transaction
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // quota check
      .mockResolvedValueOnce({
        rows: [{ id: '660e8400-e29b-41d4-a716-446655440001', storage_key: 'weddings/w-001/uploads/2026/03/upload-001/original.jpg', type: 'photo' }],
      }) // source upload
      .mockResolvedValueOnce({ rows: [] }) // insert ai_job
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/ai-portrait', {
      method: 'POST',
      body: JSON.stringify({
        source_upload_id: '660e8400-e29b-41d4-a716-446655440001',
        style_id: 'watercolor',
      }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await POST(request, makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.job_id).toBe('job-001');
    expect(body.data.status).toBe('queued');
    expect(body.data.style.name).toBe('Watercolor');
    expect(body.data.quota.remaining).toBe(2); // was 3, used 1
  });

  it('rejects when portrait quota is exceeded', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'w-001', package_config: { ai_portraits_per_guest: 5 }, status: 'active' }],
    });

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ count: '5' }] }); // quota check — at limit

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/ai-portrait', {
      method: 'POST',
      body: JSON.stringify({
        source_upload_id: '660e8400-e29b-41d4-a716-446655440001',
        style_id: 'watercolor',
      }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await POST(request, makeParams());
    expect(response.status).toBe(429);
  });

  it('rejects invalid style ID', async () => {
    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/ai-portrait', {
      method: 'POST',
      body: JSON.stringify({
        source_upload_id: '660e8400-e29b-41d4-a716-446655440001',
        style_id: 'nonexistent-style',
      }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await POST(request, makeParams());
    expect(response.status).toBe(400);
  });

  it('rejects when source upload is a video', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'w-001', package_config: { ai_portraits_per_guest: 5 }, status: 'active' }],
    });

    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // quota
      .mockResolvedValueOnce({
        rows: [{ id: '660e8400-e29b-41d4-a716-446655440001', storage_key: 'test.mp4', type: 'video' }],
      }); // source — video!

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/ai-portrait', {
      method: 'POST',
      body: JSON.stringify({
        source_upload_id: '660e8400-e29b-41d4-a716-446655440001',
        style_id: 'watercolor',
      }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await POST(request, makeParams());
    expect(response.status).toBe(400);
  });
});

describe('GET /api/v1/w/[slug]/ai-portrait/[jobId]', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns job status for a completed portrait', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'job-001',
        status: 'completed',
        style_id: 'watercolor',
        output_key: 'weddings/w-001/ai/job-001/output.png',
        error_message: null,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      }],
    });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/ai-portrait/job-001', {
      headers: { Cookie: 'wedding_session=valid-token' },
    });

    const response = await GET(request, makeJobParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('completed');
    expect(body.data.output_url).toContain('output.png');
  });

  it('returns queued status for pending job', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'job-001',
        status: 'queued',
        style_id: 'anime',
        output_key: null,
        error_message: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      }],
    });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/ai-portrait/job-001', {
      headers: { Cookie: 'wedding_session=valid-token' },
    });

    const response = await GET(request, makeJobParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('queued');
    expect(body.data.output_url).toBeNull();
  });

  it('returns 400 for non-existent job', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/ai-portrait/no-job', {
      headers: { Cookie: 'wedding_session=valid-token' },
    });

    const response = await GET(request, makeJobParams('neil-shriya', 'no-job'));
    expect(response.status).toBe(400);
  });
});
