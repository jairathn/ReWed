import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

vi.mock('@/lib/dashboard-auth', () => ({
  requireWeddingAccess: vi.fn().mockResolvedValue({ role: 'couple', coupleId: 'c-1' }),
}));

import { GET } from '@/app/api/v1/dashboard/weddings/[weddingId]/suggestions/route';
import { PATCH } from '@/app/api/v1/dashboard/weddings/[weddingId]/suggestions/[suggestionId]/route';

function listParams() {
  return { params: Promise.resolve({ weddingId: 'w-1' }) };
}
function detailParams(suggestionId = 's-1') {
  return { params: Promise.resolve({ weddingId: 'w-1', suggestionId }) };
}

describe('GET /api/v1/dashboard/weddings/[weddingId]/suggestions', () => {
  beforeEach(() => mockQuery.mockReset());

  it('returns pending suggestions by default', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 's-1', source_type: 'email', source_ref: 'm-1', source_summary: 'Re: caterer',
        source_url: null, action_type: 'create_todo', payload: { title: 'Confirm headcount' },
        rationale: 'Caterer asked for headcount', status: 'pending', resolved_at: null,
        resolved_by_role: null, applied_entity_id: null, created_at: new Date().toISOString(),
      }],
    });
    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/suggestions');
    const res = await GET(req, listParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.suggestions).toHaveLength(1);
  });
});

describe('PATCH /api/v1/dashboard/weddings/[weddingId]/suggestions/[suggestionId]', () => {
  beforeEach(() => mockQuery.mockReset());

  it('declines a pending suggestion', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 's-1', wedding_id: 'w-1', action_type: 'create_todo', payload: {}, status: 'pending' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/suggestions/s-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'decline' }),
    });
    const res = await PATCH(req, detailParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.status).toBe('declined');
  });

  it('accepts a create_todo suggestion and applies it', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 's-1', wedding_id: 'w-1', action_type: 'create_todo',
          payload: { title: 'Pick song', assignee_hint: 'couple', priority: 'normal' },
          status: 'pending',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'todo-new' }] }) // INSERT into todos
      .mockResolvedValueOnce({ rows: [] }); // UPDATE suggestions

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/suggestions/s-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept' }),
    });
    const res = await PATCH(req, detailParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.status).toBe('accepted');
    expect(body.data.applied_entity_id).toBe('todo-new');
  });

  it('refuses to resolve an already-resolved suggestion', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 's-1', wedding_id: 'w-1', action_type: 'create_todo', payload: {}, status: 'accepted' }],
    });
    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/suggestions/s-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'decline' }),
    });
    const res = await PATCH(req, detailParams());
    expect(res.status).toBe(400);
  });
});
