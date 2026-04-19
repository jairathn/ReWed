import { describe, it, expect, beforeEach } from 'vitest';
import { encryptToken, decryptToken } from '@/lib/google/crypto';

describe('Google token encryption', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'a-stable-test-secret-at-least-32-chars-long!!';
  });

  it('round-trips a token', () => {
    const original = '1//abcdefghijklmnopqrstuvwxyz1234567890';
    const encrypted = encryptToken(original);
    expect(encrypted).not.toBe(original);
    expect(decryptToken(encrypted)).toBe(original);
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    const a = encryptToken('hello');
    const b = encryptToken('hello');
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe('hello');
    expect(decryptToken(b)).toBe('hello');
  });

  it('throws on tampered ciphertext (auth tag mismatch)', () => {
    const ct = encryptToken('secret');
    const tampered = ct.slice(0, -4) + 'xxxx';
    expect(() => decryptToken(tampered)).toThrow();
  });
});
