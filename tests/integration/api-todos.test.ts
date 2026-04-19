import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

vi.mock('@/lib/dashboard-auth', () => ({
  requireWeddingAccess: vi.fn().mockResolvedValue({ role: 'couple', coupleId: 'c-1' }),
}));

import { GET, POST } from '@/app/api/v1/dashboard/weddings/[weddingId]/todos/route';
import { PATCH } from '@/app/api/v1/dashboard/weddings/[weddingId]/todos/[todoId]/route';

function listParams() {
  return { params: Promise.resolve({ weddingId: 'w-1' }) };
}
function detailParams(todoId = 't-1') {
  return { params: Promise.resolve({ weddingId: 'w-1', todoId }) };
}

describe('GET /api/v1/dashboard/weddings/[weddingId]/todos', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('annotates todos with age + urgency and returns counts', async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString();
    const fresh = new Date().toISOString();

    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 't-1', meeting_id: null, title: 'Yellow one', description: null, due_date: null, priority: 'normal', status: 'open', assigned_to_vendor_id: null, created_at: fortyDaysAgo, completed_at: null, completed_by_role: null, vendor_name: null, meeting_title: null, meeting_date: null },
        { id: 't-2', meeting_id: null, title: 'Red one', description: null, due_date: null, priority: 'high', status: 'open', assigned_to_vendor_id: null, created_at: sixtyDaysAgo, completed_at: null, completed_by_role: null, vendor_name: null, meeting_title: null, meeting_date: null },
        { id: 't-3', meeting_id: null, title: 'Fresh one', description: null, due_date: null, priority: 'normal', status: 'open', assigned_to_vendor_id: null, created_at: fresh, completed_at: null, completed_by_role: null, vendor_name: null, meeting_title: null, meeting_date: null },
      ],
    });

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/todos');
    const res = await GET(req, listParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.todos).toHaveLength(3);
    expect(body.data.todos[0].urgency).toBe('yellow');
    expect(body.data.todos[1].urgency).toBe('red');
    expect(body.data.todos[2].urgency).toBe('fresh');
    expect(body.data.urgency_counts).toEqual({ fresh: 1, yellow: 1, orange: 0, red: 1 });
  });
});

describe('POST /api/v1/dashboard/weddings/[weddingId]/todos', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('creates a couple to-do with no vendor', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 't-new', created_at: new Date().toISOString() }] });
    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Pick wedding playlist', priority: 'high' }),
    });
    const res = await POST(req, listParams());
    expect(res.status).toBe(200);
  });

  it('rejects assigning to a vendor that doesn\'t belong to this wedding', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // vendor lookup empty
    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Bad assignment',
        assigned_to_vendor_id: '11111111-1111-4111-8111-111111111111',
      }),
    });
    const res = await POST(req, listParams());
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/dashboard/weddings/[weddingId]/todos/[todoId]', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('marks completed and stamps completed_at + role', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 't-1' }] })  // ensureTodoOwned
      .mockResolvedValueOnce({ rows: [] });                // UPDATE

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/todos/t-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    const res = await PATCH(req, detailParams());
    expect(res.status).toBe(200);

    const updateCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('UPDATE todos')
    )!;
    expect(updateCall[0]).toContain('completed_at = NOW()');
    expect(updateCall[0]).toContain('status =');
  });
});
