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

import { GET, POST } from '@/app/api/v1/w/[slug]/feed/route';

function makeParams(slug = 'neil-shriya') {
  return { params: Promise.resolve({ slug }) };
}

describe('GET /api/v1/w/[slug]/feed', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns paginated feed posts', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }) // wedding
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'p-001',
            type: 'text',
            content: 'What a beautiful ceremony!',
            photo_key: null,
            like_count: 3,
            comment_count: 1,
            is_pinned: false,
            created_at: new Date().toISOString(),
            guest_id: 'g-002',
            first_name: 'Priya',
            last_name: 'Patel',
            display_name: 'Priya Patel',
          },
        ],
      }) // posts
      .mockResolvedValueOnce({ rows: [] }); // likes

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed', {
      headers: { Cookie: 'wedding_session=valid-token' },
    });

    const response = await GET(request, makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].content).toBe('What a beautiful ceremony!');
    expect(body.data.items[0].guest.first_name).toBe('Priya');
    expect(body.data.items[0].is_liked).toBe(false);
    expect(body.data.has_more).toBe(false);
  });

  it('returns empty list for wedding with no posts', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] })
      .mockResolvedValueOnce({ rows: [] });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed', {
      headers: { Cookie: 'wedding_session=valid-token' },
    });

    const response = await GET(request, makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(0);
  });

  it('returns 401 without session', async () => {
    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed');

    const response = await GET(request, makeParams());
    expect(response.status).toBe(401);
  });
});

describe('POST /api/v1/w/[slug]/feed', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('creates a text post', async () => {
    const now = new Date().toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001', package_config: { social_feed: true } }] }) // wedding
      .mockResolvedValueOnce({
        rows: [{
          id: 'p-new',
          type: 'text',
          content: 'Having an amazing time!',
          photo_key: null,
          like_count: 0,
          comment_count: 0,
          is_pinned: false,
          created_at: now,
        }],
      }) // insert
      .mockResolvedValueOnce({
        rows: [{ id: 'g-001', first_name: 'Aditya', last_name: 'Sharma', display_name: 'Aditya Sharma' }],
      }); // guest

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed', {
      method: 'POST',
      body: JSON.stringify({ type: 'text', content: 'Having an amazing time!' }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await POST(request, makeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.post.content).toBe('Having an amazing time!');
    expect(body.data.post.type).toBe('text');
    expect(body.data.post.guest.first_name).toBe('Aditya');
  });

  it('creates a memory post', async () => {
    const now = new Date().toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001', package_config: { social_feed: true } }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'p-new',
          type: 'memory',
          content: 'I remember when they first met...',
          photo_key: null,
          like_count: 0,
          comment_count: 0,
          is_pinned: false,
          created_at: now,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'g-001', first_name: 'Aditya', last_name: 'Sharma', display_name: 'Aditya Sharma' }],
      });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed', {
      method: 'POST',
      body: JSON.stringify({ type: 'memory', content: 'I remember when they first met...' }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await POST(request, makeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.post.type).toBe('memory');
  });

  it('rejects post without content or photo', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'w-001', package_config: { social_feed: true } }] });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed', {
      method: 'POST',
      body: JSON.stringify({ type: 'text' }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await POST(request, makeParams());
    expect(response.status).toBe(400);
  });

  it('rejects post when social feed feature is disabled', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'w-001', package_config: { social_feed: false } }] });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed', {
      method: 'POST',
      body: JSON.stringify({ type: 'text', content: 'Hello!' }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await POST(request, makeParams());
    expect(response.status).toBe(403);
  });
});
