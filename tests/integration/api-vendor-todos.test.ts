import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

import { GET } from '@/app/api/v1/v/[slug]/[token]/route';
import { PATCH } from '@/app/api/v1/v/[slug]/[token]/todos/[todoId]/route';

const TOKEN = 'a'.repeat(48);
const VENDOR_AUTH = {
  vendor_id: 'v-1', name: 'Jas Johal', company: null, category: 'DJ',
  email: 'jas@example.com', phone: null, whatsapp: false, notes: null,
  wedding_id: 'w-1', slug: 'shriya-neil', display_name: 'Shriya & Neil',
  wedding_date: '2026-09-11', timezone: 'Europe/Madrid',
  venue_city: 'Barcelona', venue_country: 'Spain',
  config: {},
};

function portalParams() {
  return { params: Promise.resolve({ slug: 'shriya-neil', token: TOKEN }) };
}

function todoParams(todoId = 't-1') {
  return { params: Promise.resolve({ slug: 'shriya-neil', token: TOKEN, todoId }) };
}

describe('vendor portal includes annotated todos', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns to-dos for the vendor with urgency bands', async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    mockQuery
      .mockResolvedValueOnce({ rows: [VENDOR_AUTH] })  // auth
      .mockResolvedValueOnce({ rows: [] })              // assigned entries
      .mockResolvedValueOnce({ rows: [] })              // master timeline
      .mockResolvedValueOnce({                          // todos
        rows: [
          {
            id: 't-1',
            title: 'Send setlist',
            description: null,
            due_date: null,
            priority: 'high',
            status: 'open',
            created_at: fortyDaysAgo,
            completed_at: null,
            completed_by_role: null,
            meeting_title: 'Sangeet sound walk',
            meeting_date: '2026-04-12',
          },
        ],
      });

    const req = new NextRequest(`http://localhost:3000/api/v1/v/shriya-neil/${TOKEN}`);
    const res = await GET(req, portalParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.todos).toHaveLength(1);
    expect(body.data.todos[0].urgency).toBe('yellow');
    expect(body.data.todos[0].age_days).toBe(40);
  });
});

describe('PATCH /api/v1/v/[slug]/[token]/todos/[todoId]', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('lets a vendor mark their own to-do complete', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [VENDOR_AUTH] })   // auth
      .mockResolvedValueOnce({ rows: [{ id: 't-1' }] }) // ownership check
      .mockResolvedValueOnce({ rows: [] });              // UPDATE

    const req = new NextRequest(
      `http://localhost:3000/api/v1/v/shriya-neil/${TOKEN}/todos/t-1`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      }
    );
    const res = await PATCH(req, todoParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.status).toBe('completed');

    const updateCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes("status = 'completed'")
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toContain("completed_by_role = 'vendor'");
  });

  it('rejects when the to-do is not assigned to this vendor', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [VENDOR_AUTH] })
      .mockResolvedValueOnce({ rows: [] }); // ownership check fails

    const req = new NextRequest(
      `http://localhost:3000/api/v1/v/shriya-neil/${TOKEN}/todos/t-9`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      }
    );
    const res = await PATCH(req, todoParams('t-9'));
    expect(res.status).toBe(404);
  });
});
