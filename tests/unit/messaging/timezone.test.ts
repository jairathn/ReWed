import { describe, it, expect } from 'vitest';
import { zonedWallClockToUtc } from '@/lib/messaging/timezone';

describe('zonedWallClockToUtc', () => {
  it('treats a UTC wall clock as itself', () => {
    expect(zonedWallClockToUtc('2026-06-13T15:30', 'UTC').toISOString()).toBe(
      '2026-06-13T15:30:00.000Z'
    );
  });

  it('converts an EDT (summer) wall clock to UTC', () => {
    // America/New_York is UTC-4 in June → 15:30 local = 19:30 UTC
    expect(zonedWallClockToUtc('2026-06-13T15:30', 'America/New_York').toISOString()).toBe(
      '2026-06-13T19:30:00.000Z'
    );
  });

  it('converts an EST (winter) wall clock to UTC', () => {
    // America/New_York is UTC-5 in January → 09:00 local = 14:00 UTC
    expect(zonedWallClockToUtc('2026-01-15T09:00', 'America/New_York').toISOString()).toBe(
      '2026-01-15T14:00:00.000Z'
    );
  });

  it('handles a positive, half-hour offset zone with no DST (India)', () => {
    // Asia/Kolkata is UTC+5:30 → 18:00 local = 12:30 UTC
    expect(zonedWallClockToUtc('2026-06-13T18:00', 'Asia/Kolkata').toISOString()).toBe(
      '2026-06-13T12:30:00.000Z'
    );
  });
});
