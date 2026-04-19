import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  // Reuse JWT_SECRET (already a long random secret) as the source for an
  // AES key. SHA-256'd to guarantee 32 bytes regardless of the env value.
  const secret = process.env.JWT_SECRET || process.env.GUEST_SESSION_SECRET || '';
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET (or GUEST_SESSION_SECRET) must be set to encrypt Google tokens');
  }
  return createHash('sha256').update(secret).digest();
}

/**
 * AES-256-GCM encryption for storing OAuth refresh/access tokens at rest.
 * Output format: base64(iv || authTag || ciphertext) — single string keeps
 * the schema simple.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptToken(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
