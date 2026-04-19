import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/email/resend-client', () => ({
  sendEmail: vi.fn(),
  isResendConfigured: vi.fn().mockReturnValue(true),
}));

import { sendVendorProposalEmail, diffTimelineEntry } from '@/lib/vendor/emails';
import { sendEmail } from '@/lib/email/resend-client';

const mockedSendEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;

function makePool() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { query } as unknown as import('pg').Pool;
}

describe('sendVendorProposalEmail', () => {
  beforeEach(() => {
    mockedSendEmail.mockReset();
  });

  it('prefixes the subject with "From [Vendor name]"', async () => {
    mockedSendEmail.mockResolvedValueOnce({ id: 'rs-1', error: null });
    const pool = makePool();
    await sendVendorProposalEmail(pool, {
      weddingId: 'w-1',
      weddingName: 'Test Wedding',
      vendorId: 'v-1',
      vendorName: 'Jas Johal',
      vendorEmail: 'jas@example.com',
      notificationEmail: 'shriyaneilwedding@gmail.com',
      comment: 'I need the program order before Friday.',
      proposedChange: null,
      entryDescription: 'Sept 10 · Sangeet · Audio checks',
    });
    const call = mockedSendEmail.mock.calls[0][0];
    expect(call.subject.startsWith('From Jas Johal — ')).toBe(true);
    expect(call.to).toBe('shriyaneilwedding@gmail.com');
    expect(call.replyTo).toBe('jas@example.com');
  });

  it('writes a row to vendor_email_log even when Resend errors', async () => {
    mockedSendEmail.mockResolvedValueOnce({ id: null, error: 'rate limit' });
    const pool = makePool();
    const result = await sendVendorProposalEmail(pool, {
      weddingId: 'w-1',
      weddingName: 'Test Wedding',
      vendorId: 'v-1',
      vendorName: 'Marina',
      vendorEmail: null,
      notificationEmail: 'couple@example.com',
      comment: 'FYI',
      proposedChange: null,
      entryDescription: null,
    });
    expect(result.sent).toBe(false);
    expect((pool.query as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    const sql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sql).toContain('INSERT INTO vendor_email_log');
  });
});

describe('diffTimelineEntry', () => {
  it('returns null when nothing meaningful changed', () => {
    const before = { time_label: '10 AM', action: 'Setup', location: 'Venue', notes: '', status: '' };
    const after = { ...before };
    expect(diffTimelineEntry(before, after)).toBeNull();
  });

  it('returns bullet lines for each changed field', () => {
    const before = { time_label: '10 AM', action: 'Setup', location: 'Venue', notes: '', status: '' };
    const after = { time_label: '11 AM', action: 'Setup', location: 'Venue', notes: 'bring extension cords', status: '' };
    const summary = diffTimelineEntry(before, after);
    expect(summary).not.toBeNull();
    expect(summary).toMatch(/Time:/);
    expect(summary).toMatch(/Notes:/);
    expect(summary).not.toMatch(/Action:/);
  });
});
