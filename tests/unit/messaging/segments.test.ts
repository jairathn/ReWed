import { describe, it, expect } from 'vitest';
import { countSegments } from '@/lib/messaging/segments';

describe('countSegments', () => {
  it('returns 0 segments for empty text', () => {
    expect(countSegments('')).toEqual({ encoding: 'GSM-7', length: 0, segments: 0 });
  });

  it('counts plain ASCII as GSM-7, 160 chars in one segment', () => {
    const s = countSegments('a'.repeat(160));
    expect(s).toEqual({ encoding: 'GSM-7', length: 160, segments: 1 });
  });

  it('splits GSM-7 at 153 chars per segment once concatenated', () => {
    expect(countSegments('a'.repeat(161)).segments).toBe(2);
    expect(countSegments('a'.repeat(306)).segments).toBe(2);
    expect(countSegments('a'.repeat(307)).segments).toBe(3);
  });

  it('counts GSM-7 extended chars (€, brackets) as 2', () => {
    const s = countSegments('€'.repeat(80));
    expect(s.encoding).toBe('GSM-7');
    expect(s.length).toBe(160);
    expect(s.segments).toBe(1);
    expect(countSegments('€'.repeat(81)).segments).toBe(2);
  });

  it('switches to UCS-2 for emoji and curly quotes', () => {
    const s = countSegments('Shuttle leaves at 3:30 \u{1F698}');
    expect(s.encoding).toBe('UCS-2');
    // emoji is a surrogate pair = 2 UTF-16 units
    expect(s.length).toBe('Shuttle leaves at 3:30 '.length + 2);
    expect(s.segments).toBe(1);
    expect(countSegments('’' + 'a'.repeat(70)).segments).toBe(2);
  });

  it('keeps common SMS punctuation in GSM-7', () => {
    expect(countSegments("Don't forget: RSVP @ 5pm!").encoding).toBe('GSM-7');
  });
});
