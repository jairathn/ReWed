import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

vi.mock('@/lib/dashboard-auth', () => ({
  requireWeddingAccess: vi.fn().mockResolvedValue({ role: 'couple', coupleId: 'c-1' }),
}));

import { POST } from '@/app/api/v1/dashboard/weddings/[weddingId]/chat/route';
import { DAILY_EXPERT_LIMIT } from '@/lib/chatbot-limit';

function makeParams() {
  return { params: Promise.resolve({ weddingId: 'w-1' }) };
}

describe('POST /api/v1/dashboard/weddings/[weddingId]/chat', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns a mock answer in test mode and reports remaining', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] }); // chatbot_usage upsert

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'is there anything I am forgetting?' }),
    });
    const res = await POST(req, makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.answer).toContain('mock expert answer');
    expect(body.data.limit).toBe(DAILY_EXPERT_LIMIT);
    expect(body.data.remaining).toBe(DAILY_EXPERT_LIMIT - 1);
  });

  it('rate-limits the 51st question of the day', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: DAILY_EXPERT_LIMIT + 1 }] });

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'one too many' }),
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(429);
  });

  it('rejects empty questions', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '' }),
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
  });
});
