import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: vi.fn(),
  }),
}));

vi.mock('@/lib/session', () => ({
  validateSession: vi.fn().mockResolvedValue({
    sessionId: 's-001',
    weddingId: 'w-001',
    guestId: 'g-001',
  }),
}));

import { GET } from '@/app/api/v1/w/[slug]/media/[guestId]/route';

function makeParams(slug = 'neil-shriya', guestId = 'g-001') {
  return { params: Promise.resolve({ slug, guestId }) };
}

describe('GET /api/v1/w/[slug]/media/[guestId]', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns media items for a guest', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }) // wedding
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'u-001',
            type: 'photo',
            storage_key: 'weddings/w-001/uploads/2026/03/u-001/original.jpg',
            thumbnail_key: 'weddings/w-001/uploads/2026/03/u-001/thumbnail.jpg',
            filter_applied: 'golden-hour',
            duration_ms: null,
            created_at: '2026-03-03T12:00:00.000Z',
            event_name: 'Ceremony',
          },
          {
            id: 'u-002',
            type: 'video',
            storage_key: 'weddings/w-001/uploads/2026/03/u-002/original.mp4',
            thumbnail_key: 'weddings/w-001/uploads/2026/03/u-002/thumbnail.jpg',
            filter_applied: null,
            duration_ms: 45000,
            created_at: '2026-03-03T11:00:00.000Z',
            event_name: null,
          },
        ],
      }) // uploads
      .mockResolvedValueOnce({ rows: [] }); // portraits

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/media/g-001?limit=20', {
      headers: { Cookie: 'wedding_session=valid-token' },
    });

    const response = await GET(request, makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0].type).toBe('photo');
    expect(body.data.items[0].url).toContain('original.jpg');
    expect(body.data.items[0].filter_applied).toBe('golden-hour');
    expect(body.data.items[1].type).toBe('video');
    expect(body.data.items[1].duration_ms).toBe(45000);
    expect(body.data.has_more).toBe(false);
  });

  it('includes AI portraits in results', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }) // wedding
      .mockResolvedValueOnce({ rows: [] }) // uploads (empty)
      .mockResolvedValueOnce({
        rows: [{
          id: 'ai-001',
          type: 'portrait',
          storage_key: 'weddings/w-001/ai/ai-001/output.png',
          thumbnail_key: 'weddings/w-001/ai/ai-001/output.png',
          filter_applied: 'watercolor',
          duration_ms: null,
          created_at: new Date().toISOString(),
          event_name: null,
        }],
      }); // portraits

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/media/g-001?limit=20', {
      headers: { Cookie: 'wedding_session=valid-token' },
    });

    const response = await GET(request, makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].type).toBe('portrait');
  });

  it('filters by type when specified', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'u-001',
          type: 'photo',
          storage_key: 'test.jpg',
          thumbnail_key: 'test-thumb.jpg',
          filter_applied: null,
          duration_ms: null,
          created_at: new Date().toISOString(),
          event_name: null,
        }],
      }); // only photo query (no portrait query because type=photo)

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/media/g-001?type=photo&limit=20', {
      headers: { Cookie: 'wedding_session=valid-token' },
    });

    const response = await GET(request, makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].type).toBe('photo');
  });

  it('returns empty for guest with no media', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/media/g-001?limit=20', {
      headers: { Cookie: 'wedding_session=valid-token' },
    });

    const response = await GET(request, makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(0);
    expect(body.data.has_more).toBe(false);
  });

  it('returns 401 without session', async () => {
    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/media/g-001');

    const response = await GET(request, makeParams());
    expect(response.status).toBe(401);
  });
});
