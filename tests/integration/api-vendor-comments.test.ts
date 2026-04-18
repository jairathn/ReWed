import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

const sendEmailMock = vi.fn();
vi.mock('@/lib/email/resend-client', () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
  isResendConfigured: () => true,
}));

import { POST } from '@/app/api/v1/v/[slug]/[token]/comments/route';

const TOKEN = 'a'.repeat(48);
function makeParams() {
  return { params: Promise.resolve({ slug: 'shriya-neil', token: TOKEN }) };
}

const vendorAuthRow = {
  vendor_id: 'v-1', name: 'Jas Johal', company: null, category: 'DJ / MC',
  email: 'jas@example.com', phone: null, whatsapp: false, notes: null,
  wedding_id: 'w-1', slug: 'shriya-neil', display_name: 'Shriya & Neil',
  wedding_date: '2026-09-11', timezone: 'Europe/Madrid',
  venue_city: 'Barcelona', venue_country: 'Spain',
  config: { vendor_notification_email: 'override@example.com' },
};

describe('POST /api/v1/v/[slug]/[token]/comments', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ id: 'rs-1', error: null });
  });

  it('persists the comment and emails the configured notification address', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [vendorAuthRow] })   // authenticateVendor
      .mockResolvedValueOnce({ rows: [{ id: 'comment-1', created_at: new Date().toISOString() }] }) // INSERT
      .mockResolvedValueOnce({ rows: [] });               // logEmail

    const req = new NextRequest('http://localhost:3000/api/v1/v/shriya-neil/' + TOKEN + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: 'Need program order before Friday.' }),
    });
    const res = await POST(req, makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.email_sent).toBe(true);

    // Subject must start with "From [Vendor name]"
    const call = sendEmailMock.mock.calls[0][0];
    expect(call.subject.startsWith('From Jas Johal — ')).toBe(true);
    expect(call.to).toBe('override@example.com');
  });

  it('falls back to the default notification email when none is configured', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ ...vendorAuthRow, config: {} }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'comment-2', created_at: new Date().toISOString() }] })
      .mockResolvedValueOnce({ rows: [] });

    const req = new NextRequest('http://localhost:3000/api/v1/v/shriya-neil/' + TOKEN + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: 'Hello couple' }),
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(200);

    const call = sendEmailMock.mock.calls[0][0];
    expect(call.to).toBe('shriyaneilwedding@gmail.com');
  });

  it('rejects empty comments', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [vendorAuthRow] });
    const req = new NextRequest('http://localhost:3000/api/v1/v/shriya-neil/' + TOKEN + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: '' }),
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
  });
});
