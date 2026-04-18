import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

vi.mock('@/lib/dashboard-auth', () => ({
  requireWeddingAccess: vi.fn().mockResolvedValue({ role: 'couple', coupleId: 'c-1' }),
}));

import { POST as CREATE } from '@/app/api/v1/dashboard/weddings/[weddingId]/vendors/route';
import { PATCH } from '@/app/api/v1/dashboard/weddings/[weddingId]/vendors/[vendorId]/route';

function listParams() {
  return { params: Promise.resolve({ weddingId: 'w-1' }) };
}
function detailParams(vendorId = 'v-1') {
  return { params: Promise.resolve({ weddingId: 'w-1', vendorId }) };
}

describe('vendor CRUD endpoints', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('creates a vendor with international phone format', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'v-new', access_token: 'a'.repeat(48) }] });

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Evelina',
        category: 'Wedding Planner',
        email: 'evelina@eyaweddings.com',
        phone: '+34 622 48 92 76',
        whatsapp: true,
      }),
    });
    const res = await CREATE(req, listParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.id).toBe('v-new');
    expect(body.data.access_token).toHaveLength(48);
  });

  it('rejects malformed phone numbers', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad Phone',
        phone: 'call me maybe',
      }),
    });
    const res = await CREATE(req, listParams());
    expect(res.status).toBe(400);
  });

  it('rotates access tokens when requested', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'v-1' }] })  // ensureVendorOwned
      .mockResolvedValueOnce({ rows: [{ access_token: 'b'.repeat(48) }] });  // UPDATE

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/vendors/v-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotate_access_token: true }),
    });
    const res = await PATCH(req, detailParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.access_token).toBe('b'.repeat(48));

    const updateCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('UPDATE vendors')
    );
    expect(updateCall![0]).toContain('access_token =');
  });
});
