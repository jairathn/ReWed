import { randomBytes, createHmac } from 'crypto';
import bcrypt from 'bcryptjs';
import type { PoolClient, Pool } from 'pg';

const SESSION_TOKEN_LENGTH = 48;

function getSessionSecret(): string {
  return process.env.GUEST_SESSION_SECRET || 'dev-secret-change-in-production-min-32-chars!!';
}

function generateToken(): string {
  return randomBytes(SESSION_TOKEN_LENGTH).toString('hex');
}

function hashToken(token: string): string {
  return createHmac('sha256', getSessionSecret())
    .update(token)
    .digest('hex');
}

export async function createGuestSession(
  pool: Pool,
  params: { weddingId: string; guestId: string; userAgent?: string; deviceType?: string }
): Promise<{ token: string; guestId: string; sessionId: string }> {
  const token = generateToken();
  const tokenHash = hashToken(token);

  const result = await pool.query(
    `INSERT INTO sessions (wedding_id, guest_id, token_hash, user_agent, device_type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [params.weddingId, params.guestId, tokenHash, params.userAgent || null, params.deviceType || 'mobile']
  );

  return {
    token,
    guestId: params.guestId,
    sessionId: result.rows[0].id,
  };
}

export async function validateSession(
  pool: Pool,
  token: string
): Promise<{ sessionId: string; weddingId: string; guestId: string } | null> {
  const tokenHash = hashToken(token);

  const result = await pool.query(
    `SELECT id, wedding_id, guest_id FROM sessions WHERE token_hash = $1`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    return null;
  }

  // Update last_active
  await pool.query(
    `UPDATE sessions SET last_active = NOW() WHERE id = $1`,
    [result.rows[0].id]
  );

  return {
    sessionId: result.rows[0].id,
    weddingId: result.rows[0].wedding_id,
    guestId: result.rows[0].guest_id,
  };
}
