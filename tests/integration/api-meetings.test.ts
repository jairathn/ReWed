import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

vi.mock('@/lib/dashboard-auth', () => ({
  requireWeddingAccess: vi.fn().mockResolvedValue({ role: 'couple', coupleId: 'c-1' }),
}));

import { POST, GET } from '@/app/api/v1/dashboard/weddings/[weddingId]/meetings/route';

function makeParams() {
  return { params: Promise.resolve({ weddingId: 'w-1' }) };
}

describe('POST /api/v1/dashboard/weddings/[weddingId]/meetings', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('creates a meeting, runs AI extraction, and persists generated to-dos', async () => {
    let insertedTodos = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT display_name FROM weddings')) {
        return { rows: [{ display_name: 'Test Wedding' }] };
      }
      if (sql.includes('FROM vendors') && sql.includes('= ANY')) {
        return { rows: [{ id: 'v-1', name: 'Jas Johal', category: 'DJ' }] };
      }
      if (sql.includes('INSERT INTO meetings')) {
        return { rows: [{ id: 'm-1', created_at: new Date().toISOString() }] };
      }
      if (sql.includes('INSERT INTO meeting_stakeholders')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO todos')) {
        insertedTodos++;
        return { rows: [{ id: `t-${insertedTodos}`, assigned_to_vendor_id: null, title: 'fake' }] };
      }
      return { rows: [] };
    });

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Sangeet sound walk',
        meeting_date: '2026-04-12',
        raw_notes: 'we agreed Jas would send the playlist by Friday',
        stakeholder_vendor_ids: ['11111111-1111-4111-8111-111111111111'],
      }),
    });

    const res = await POST(req, makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    // Test-mode stub returns at least 1 couple to-do + 1 vendor to-do
    expect(body.data.todos_generated).toBeGreaterThanOrEqual(2);
    expect(insertedTodos).toBeGreaterThanOrEqual(2);
  });

  it('rejects notes shorter than 10 chars', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Quick chat',
        raw_notes: 'too short',
        stakeholder_vendor_ids: [],
      }),
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/dashboard/weddings/[weddingId]/meetings', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('lists meetings with todo counts', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 'm-1', title: 'Sound check', meeting_date: '2026-04-12', created_by_role: 'couple', created_by_label: null, created_at: new Date().toISOString(), todo_count: 4 },
      ],
    });

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/meetings');
    const res = await GET(req, makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.meetings).toHaveLength(1);
    expect(body.data.meetings[0].todo_count).toBe(4);
  });
});
