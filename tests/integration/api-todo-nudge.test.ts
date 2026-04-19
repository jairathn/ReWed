import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

vi.mock('@/lib/dashboard-auth', () => ({
  requireWeddingAccess: vi.fn().mockResolvedValue({ role: 'couple', coupleId: 'c-1' }),
}));

const sendEmailMock = vi.fn();
vi.mock('@/lib/email/resend-client', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  isResendConfigured: () => true,
}));

import { POST } from '@/app/api/v1/dashboard/weddings/[weddingId]/todos/[todoId]/nudge/route';

function makeParams(todoId = 't-1') {
  return { params: Promise.resolve({ weddingId: 'w-1', todoId }) };
}

const VENDOR_TODO = {
  id: 't-1', title: 'Confirm playlist', description: 'before Friday', due_date: null,
  priority: 'normal', status: 'open', assigned_to_vendor_id: 'v-1',
  created_at: new Date().toISOString(),
  vendor_name: 'Jas Johal', vendor_email: 'jas@example.com', access_token: 'a'.repeat(48),
  wedding_name: 'Shriya & Neil', wedding_slug: 'shriya-neil', wedding_config: {},
};

const COUPLE_TODO = {
  ...VENDOR_TODO,
  id: 't-2', assigned_to_vendor_id: null,
  vendor_name: null, vendor_email: null, access_token: null,
  wedding_config: { vendor_notification_email: 'override@example.com' },
};

describe('POST /api/v1/dashboard/weddings/[weddingId]/todos/[todoId]/nudge', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ id: 'rs-1', error: null });
  });

  it('emails the vendor when the to-do is vendor-assigned', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [VENDOR_TODO] })  // todo lookup
      .mockResolvedValueOnce({ rows: [] });             // log insert

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/todos/t-1/nudge', {
      method: 'POST',
    });
    const res = await POST(req, makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.sent).toBe(true);
    expect(sendEmailMock.mock.calls[0][0].to).toBe('jas@example.com');
  });

  it('emails the couple notification address for couple to-dos', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [COUPLE_TODO] })
      .mockResolvedValueOnce({ rows: [] });

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/todos/t-2/nudge', {
      method: 'POST',
    });
    const res = await POST(req, makeParams('t-2'));
    expect(res.status).toBe(200);
    expect(sendEmailMock.mock.calls[0][0].to).toBe('override@example.com');
  });

  it('refuses to nudge a completed to-do', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...VENDOR_TODO, status: 'completed' }],
    });

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/todos/t-1/nudge', {
      method: 'POST',
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('refuses when vendor has no email on file', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...VENDOR_TODO, vendor_email: null }],
    });

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/todos/t-1/nudge', {
      method: 'POST',
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
  });
});
