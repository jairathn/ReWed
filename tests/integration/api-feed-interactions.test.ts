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

import { POST as likeHandler } from '@/app/api/v1/w/[slug]/feed/[postId]/like/route';
import { GET as getComments, POST as addComment } from '@/app/api/v1/w/[slug]/feed/[postId]/comments/route';

function makeLikeParams(slug = 'neil-shriya', postId = 'p-001') {
  return { params: Promise.resolve({ slug, postId }) };
}

describe('POST /api/v1/w/[slug]/feed/[postId]/like', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('likes a post that is not yet liked', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'p-001', wedding_id: 'w-001', like_count: 3, is_hidden: false }],
      }) // post lookup
      .mockResolvedValueOnce({ rows: [] }) // not liked yet
      .mockResolvedValueOnce({ rows: [] }) // insert like
      .mockResolvedValueOnce({ rows: [{ like_count: 4 }] }); // update count

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed/p-001/like', {
      method: 'POST',
      headers: { Cookie: 'wedding_session=valid-token' },
    });

    const response = await likeHandler(request, makeLikeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.liked).toBe(true);
    expect(body.data.like_count).toBe(4);
  });

  it('unlikes a post that was already liked', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'p-001', wedding_id: 'w-001', like_count: 4, is_hidden: false }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'like-001' }] }) // already liked
      .mockResolvedValueOnce({ rows: [] }) // delete like
      .mockResolvedValueOnce({ rows: [{ like_count: 3 }] }); // update count

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed/p-001/like', {
      method: 'POST',
      headers: { Cookie: 'wedding_session=valid-token' },
    });

    const response = await likeHandler(request, makeLikeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.liked).toBe(false);
    expect(body.data.like_count).toBe(3);
  });

  it('rejects like on hidden post', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'p-001', wedding_id: 'w-001', like_count: 0, is_hidden: true }],
    });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed/p-001/like', {
      method: 'POST',
      headers: { Cookie: 'wedding_session=valid-token' },
    });

    const response = await likeHandler(request, makeLikeParams());
    expect(response.status).toBe(403);
  });
});

describe('Comments API', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('GET returns comments for a post', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'p-001', wedding_id: 'w-001' }] }) // post
      .mockResolvedValueOnce({
        rows: [{
          id: 'c-001',
          content: 'Great photo!',
          created_at: new Date().toISOString(),
          guest_id: 'g-002',
          first_name: 'Priya',
          last_name: 'Patel',
          display_name: 'Priya Patel',
        }],
      }); // comments

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed/p-001/comments', {
      headers: { Cookie: 'wedding_session=valid-token' },
    });

    const response = await getComments(request, makeLikeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].content).toBe('Great photo!');
    expect(body.data.items[0].guest.first_name).toBe('Priya');
  });

  it('POST creates a comment', async () => {
    const now = new Date().toISOString();
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'p-001', wedding_id: 'w-001', is_hidden: false }],
      }) // post
      .mockResolvedValueOnce({
        rows: [{ id: 'c-new', content: 'Congratulations!', created_at: now }],
      }) // insert
      .mockResolvedValueOnce({ rows: [] }) // update count
      .mockResolvedValueOnce({
        rows: [{ id: 'g-001', first_name: 'Aditya', last_name: 'Sharma', display_name: 'Aditya Sharma' }],
      }); // guest

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed/p-001/comments', {
      method: 'POST',
      body: JSON.stringify({ content: 'Congratulations!' }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await addComment(request, makeLikeParams());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.comment.content).toBe('Congratulations!');
    expect(body.data.comment.guest.first_name).toBe('Aditya');
  });

  it('POST rejects empty comment', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'p-001', wedding_id: 'w-001', is_hidden: false }],
    });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed/p-001/comments', {
      method: 'POST',
      body: JSON.stringify({ content: '' }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await addComment(request, makeLikeParams());
    expect(response.status).toBe(400);
  });

  it('POST rejects comment on hidden post', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'p-001', wedding_id: 'w-001', is_hidden: true }],
    });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/feed/p-001/comments', {
      method: 'POST',
      body: JSON.stringify({ content: 'Test' }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await addComment(request, makeLikeParams());
    expect(response.status).toBe(403);
  });
});
