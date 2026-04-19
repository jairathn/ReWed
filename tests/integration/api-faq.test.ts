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

import { POST } from '@/app/api/v1/w/[slug]/faq/route';

function makeParams(slug = 'neil-shriya') {
  return { params: Promise.resolve({ slug }) };
}

describe('POST /api/v1/w/[slug]/faq', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns an answer using mock AI in test mode', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'w-001',
          package_config: { faq_chatbot: true },
          display_name: "Neil & Shriya's Wedding",
          config: {},
        }],
      }) // wedding lookup
      .mockResolvedValueOnce({ rows: [{ count: 1 }] }) // chatbot_usage upsert (rate limit)
      .mockResolvedValueOnce({ rows: [] }) // cache check
      .mockResolvedValueOnce({
        rows: [
          { id: 'faq-1', question: 'What is the dress code?', answer: 'Smart casual, colors preferred.' },
          { id: 'faq-2', question: 'Where do I park?', answer: 'Free parking at the south lot.' },
        ],
      }) // faq entries
      .mockResolvedValueOnce({ rows: [] }); // cache write

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/faq', {
      method: 'POST',
      body: JSON.stringify({ question: "What's the dress code?" }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await POST(request, makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.answer).toBeTruthy();
    expect(body.data.answer.length).toBeGreaterThan(10);
  });

  it('returns cached answer on repeat question', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'w-001',
          package_config: { faq_chatbot: true },
          display_name: "Neil & Shriya's Wedding",
          config: {},
        }],
      })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] }) // chatbot_usage upsert (rate limit)
      .mockResolvedValueOnce({ rows: [{ id: 'faq-1', question: 'q', answer: 'a' }] }) // faq entries
      .mockResolvedValueOnce({ rows: [] }) // events
      .mockResolvedValueOnce({
        rows: [{ answer: 'Smart casual, colors preferred.' }],
      }) // cache hit!
      .mockResolvedValueOnce({ rows: [] }); // increment hit

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/faq', {
      method: 'POST',
      body: JSON.stringify({ question: "What's the dress code?" }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await POST(request, makeParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.answer).toBe('Smart casual, colors preferred.');
    expect(body.data.cached).toBe(true);
  });

  it('rejects when FAQ feature is disabled', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'w-001',
        package_config: { faq_chatbot: false },
        display_name: "Neil & Shriya's Wedding",
        config: {},
      }],
    });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/faq', {
      method: 'POST',
      body: JSON.stringify({ question: "What's the dress code?" }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await POST(request, makeParams());
    expect(response.status).toBe(403);
  });

  it('rejects empty question', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'w-001',
        package_config: { faq_chatbot: true },
        display_name: "Neil & Shriya's Wedding",
        config: {},
      }],
    });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/faq', {
      method: 'POST',
      body: JSON.stringify({ question: '' }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await POST(request, makeParams());
    expect(response.status).toBe(400);
  });

  it('returns 401 without session', async () => {
    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/faq', {
      method: 'POST',
      body: JSON.stringify({ question: 'Hello' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request, makeParams());
    expect(response.status).toBe(401);
  });

  it('rate-limits the 21st question of the day', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'w-001',
          package_config: { faq_chatbot: true },
          display_name: "Neil & Shriya's Wedding",
          config: {},
        }],
      })
      // chatbot_usage upsert returns count > limit
      .mockResolvedValueOnce({ rows: [{ count: 21 }] });

    const request = new NextRequest('http://localhost:3000/api/v1/w/neil-shriya/faq', {
      method: 'POST',
      body: JSON.stringify({ question: 'one too many' }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'wedding_session=valid-token',
      },
    });

    const response = await POST(request, makeParams());
    expect(response.status).toBe(429);
  });
});
