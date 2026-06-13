import { describe, it, expect } from 'vitest';
import { normalizePhone } from '@/lib/messaging/normalize-phone';

describe('normalizePhone', () => {
  it('returns empty for null/blank', () => {
    expect(normalizePhone(null).reason).toBe('empty');
    expect(normalizePhone('').reason).toBe('empty');
    expect(normalizePhone('   ').reason).toBe('empty');
  });

  it('keeps an explicit + country code, stripping formatting', () => {
    expect(normalizePhone('+1-555-867-5309').e164).toBe('+15558675309');
    expect(normalizePhone('+34 612 34 56 78').e164).toBe('+34612345678');
  });

  describe('US default (+1)', () => {
    it('assumes +1 for a bare 10-digit number', () => {
      expect(normalizePhone('8122490769')).toEqual({ ok: true, e164: '+18122490769' });
      expect(normalizePhone('(812) 249-0769').e164).toBe('+18122490769');
    });

    it('treats 11 digits starting with 1 as +1', () => {
      expect(normalizePhone('18122490769').e164).toBe('+18122490769');
    });

    it('keeps a longer international number typed without +', () => {
      // 91 + 10-digit India number, no leading + — do not force +1
      expect(normalizePhone('919876543210').e164).toBe('+919876543210');
    });

    it('rejects too-short numbers (not a complete US number)', () => {
      expect(normalizePhone('8675309').ok).toBe(false);
      expect(normalizePhone('1234').reason).toBe('too_short');
    });

    it('rejects numbers with letters', () => {
      expect(normalizePhone('+34abc').ok).toBe(false);
      expect(normalizePhone('call-me').ok).toBe(false);
    });
  });

  describe('configured non-US default', () => {
    it('prepends the calling code and strips a trunk-0 (UK)', () => {
      expect(normalizePhone('07700 900123', '44').e164).toBe('+447700900123');
      expect(normalizePhone('612345678', '34').e164).toBe('+34612345678');
    });

    it('keeps a full international number that already leads with the code', () => {
      expect(normalizePhone('447700900123', '44').e164).toBe('+447700900123');
    });

    it('still honors an explicit + code over the default', () => {
      expect(normalizePhone('+15558675309', '44').e164).toBe('+15558675309');
    });
  });

  describe('strict mode (null)', () => {
    it('flags a bare 10-digit number as ambiguous rather than guessing', () => {
      expect(normalizePhone('5558675309', null).reason).toBe('ambiguous_no_country');
    });

    it('keeps an 11+ digit number as international', () => {
      expect(normalizePhone('34612345678', null).e164).toBe('+34612345678');
    });
  });
});
