import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

vi.mock('@/lib/dashboard-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dashboard-auth')>();
  return {
    ...actual,
    getCoupleId: vi.fn().mockReturnValue('c-1'),
    verifyWeddingOwnership: vi.fn().mockResolvedValue(undefined),
  };
});

const sendEmailMock = vi.fn();
vi.mock('@/lib/email/resend-client', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  isResendConfigured: () => true,
}));

import { POST } from '@/app/api/v1/dashboard/weddings/[weddingId]/planners/route';
import { DELETE } from '@/app/api/v1/dashboard/weddings/[weddingId]/planners/[plannerId]/route';

function listParams() {
  return { params: Promise.resolve({ weddingId: 'w-1' }) };
}
function detailParams(plannerId = 'p-1') {
  return { params: Promise.resolve({ weddingId: 'w-1', plannerId }) };
}

describe('planner access endpoints', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ id: 'rs-1', error: null });
  });

  it('grants planner access and emails the magic link', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'p-1', name: 'Evelina', email: 'evelina@x.com', access_token: 'tok', created_at: new Date().toISOString(), revoked_at: null }] })
      .mockResolvedValueOnce({ rows: [{ display_name: 'Shriya & Neil' }] });

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/planners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'evelina@x.com', name: 'Evelina' }),
    });
    const res = await POST(req, listParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.email_sent).toBe(true);
    expect(body.data.magic_link).toContain('/planner/');

    const call = sendEmailMock.mock.calls[0][0];
    expect(call.to).toBe('evelina@x.com');
    expect(call.subject).toContain('Planner access');
  });

  it('soft-revokes planner access on DELETE', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'p-1' }] })  // ensurePlannerOwned
      .mockResolvedValueOnce({ rows: [] });               // UPDATE revoked_at

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/planners/p-1', {
      method: 'DELETE',
    });
    const res = await DELETE(req, detailParams());
    expect(res.status).toBe(200);

    const updateCall = mockQuery.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].startsWith('UPDATE planner_access')
    );
    expect(updateCall![0]).toContain('revoked_at = NOW()');
  });
});
