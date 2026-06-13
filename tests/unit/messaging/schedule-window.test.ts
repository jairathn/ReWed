import { describe, it, expect } from 'vitest';
import { validateSendAt, MIN_LEAD_MS, MAX_LEAD_MS } from '@/lib/messaging/schedule-window';

describe('validateSendAt', () => {
  const now = new Date('2026-06-13T12:00:00.000Z');
  const at = (ms: number) => new Date(now.getTime() + ms).toISOString();

  it('rejects an unparseable date', () => {
    const r = validateSendAt('not-a-date', now);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/invalid/i);
  });

  it('rejects a time in the past', () => {
    expect(validateSendAt(at(-60_000), now).ok).toBe(false);
  });

  it('rejects under the 15-minute minimum', () => {
    // 10 minutes out — clearly under, even with the 1-min grace
    expect(validateSendAt(at(10 * 60_000), now).ok).toBe(false);
  });

  it('accepts a comfortably valid time and returns the parsed date', () => {
    const r = validateSendAt(at(MIN_LEAD_MS + 60_000), now);
    expect(r.ok).toBe(true);
    expect(r.date?.getTime()).toBe(now.getTime() + MIN_LEAD_MS + 60_000);
  });

  it('allows a small grace just under the 15-minute mark', () => {
    // 14m30s out — within the 1-minute grace
    expect(validateSendAt(at(14 * 60_000 + 30_000), now).ok).toBe(true);
  });

  it('accepts right at the 35-day maximum', () => {
    expect(validateSendAt(at(MAX_LEAD_MS), now).ok).toBe(true);
  });

  it('rejects beyond the 35-day maximum', () => {
    const r = validateSendAt(at(MAX_LEAD_MS + 60_000), now);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/35 days/);
  });
});
