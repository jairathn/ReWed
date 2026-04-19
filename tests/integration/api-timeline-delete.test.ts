import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

vi.mock('@/lib/dashboard-auth', () => ({
  requireWeddingAccess: vi.fn().mockResolvedValue({ role: 'couple', coupleId: 'c-1' }),
}));

import { DELETE } from '@/app/api/v1/dashboard/weddings/[weddingId]/timeline/route';

function makeParams(weddingId = 'w-1') {
  return { params: Promise.resolve({ weddingId }) };
}

describe('DELETE /api/v1/dashboard/weddings/[weddingId]/timeline', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('deletes all entries when no query params', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 12 });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/dashboard/weddings/w-1/timeline',
      { method: 'DELETE' }
    );
    const res = await DELETE(req, makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.deleted).toBe(12);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('DELETE FROM timeline_entries');
    expect(sql).not.toContain('event_date');
  });

  it('deletes by section when event_date and event_name are provided', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 3 });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/dashboard/weddings/w-1/timeline?event_date=2026-09-09&event_name=Haldi',
      { method: 'DELETE' }
    );
    const res = await DELETE(req, makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.deleted).toBe(3);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('event_date');
    expect(sql).toContain('event_name');
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params).toContain('2026-09-09');
    expect(params).toContain('Haldi');
  });

  it('handles event_date only (null event_name)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 5 });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/dashboard/weddings/w-1/timeline?event_date=2026-09-09',
      { method: 'DELETE' }
    );
    const res = await DELETE(req, makeParams());
    const body = await res.json();
    expect(body.data.deleted).toBe(5);

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain('event_date = $2');
    expect(sql).toContain('event_name IS NULL');
  });
});
