import { describe, it, expect } from 'vitest';
import { auditPhone } from '@/lib/messaging/phone-audit';

describe('auditPhone', () => {
  it('does not flag empty/missing', () => {
    expect(auditPhone(null).suspicious).toBe(false);
    expect(auditPhone('').suspicious).toBe(false);
  });

  it('trusts an explicit country code', () => {
    // An Indian number typed correctly with +91 must never be flagged.
    expect(auditPhone('+91 98765 43210').suspicious).toBe(false);
    expect(auditPhone('+34 612 34 56 78').suspicious).toBe(false);
    expect(auditPhone('+1 812 249 0769').suspicious).toBe(false);
  });

  it('does not flag a real US 10-digit number defaulted to +1', () => {
    // 812 is a valid Indiana area code
    expect(auditPhone('8122490769').suspicious).toBe(false);
    expect(auditPhone('(415) 555-0123').suspicious).toBe(false);
  });

  it('flags a 10-digit number whose area code is not a real +1 code', () => {
    // 987 is not an assigned NANP area code → likely an Indian mobile
    const r = auditPhone('9876543210');
    expect(r.suspicious).toBe(true);
    expect(r.e164).toBe('+19876543210');
  });

  it('does not flag a long international number kept without +', () => {
    // 919876543210 normalizes to +91…, never +1
    expect(auditPhone('919876543210').suspicious).toBe(false);
  });

  it('does not flag a too-short / unnormalizable number (handled elsewhere)', () => {
    expect(auditPhone('12345').suspicious).toBe(false);
  });

  it('handles the 11-digit 1-prefixed form', () => {
    expect(auditPhone('18122490769').suspicious).toBe(false); // valid US
    expect(auditPhone('19876543210').suspicious).toBe(true); // bad area code
  });
});
