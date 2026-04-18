import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

import { POST } from '@/app/api/v1/v/[slug]/[token]/faq/route';
import { DAILY_CHATBOT_LIMIT } from '@/lib/chatbot-limit';

const TOKEN = 'a'.repeat(48);
function makeParams() {
  return { params: Promise.resolve({ slug: 'shriya-neil', token: TOKEN }) };
}

const vendorAuthRow = {
  vendor_id: 'v-1', name: 'Jas Johal', company: null, category: 'DJ / MC',
  email: null, phone: null, whatsapp: false, notes: null,
  wedding_id: 'w-1', slug: 'shriya-neil', display_name: 'Shriya & Neil',
  wedding_date: '2026-09-11', timezone: 'Europe/Madrid',
  venue_city: 'Barcelona', venue_country: 'Spain',
  config: {},
};

describe('POST /api/v1/v/[slug]/[token]/faq', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns a mock answer in test mode and reports remaining count', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [vendorAuthRow] })  // auth
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })   // chatbot_usage upsert
      .mockResolvedValueOnce({ rows: [] })               // assigned entries
      .mockResolvedValueOnce({ rows: [] });              // coord vendors

    const req = new NextRequest('http://localhost:3000/api/v1/v/shriya-neil/' + TOKEN + '/faq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'When do I arrive?' }),
    });

    const res = await POST(req, makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.answer).toContain('mock vendor answer');
    expect(body.data.remaining).toBe(DAILY_CHATBOT_LIMIT - 1);
  });

  it('rate-limits at 20 questions per day', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [vendorAuthRow] })
      .mockResolvedValueOnce({ rows: [{ count: DAILY_CHATBOT_LIMIT + 1 }] });

    const req = new NextRequest('http://localhost:3000/api/v1/v/shriya-neil/' + TOKEN + '/faq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'one too many' }),
    });

    const res = await POST(req, makeParams());
    expect(res.status).toBe(429);
  });

  it('rejects when no vendor matches the token', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const req = new NextRequest('http://localhost:3000/api/v1/v/shriya-neil/' + TOKEN + '/faq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'hi' }),
    });

    const res = await POST(req, makeParams());
    expect(res.status).toBe(404);
  });
});
