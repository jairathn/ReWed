import type { Pool } from 'pg';
import { createHash } from 'crypto';

export const DAILY_CHATBOT_LIMIT = 20;

export type BotType = 'guest' | 'vendor';

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

export function getRequestIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return '0.0.0.0';
}

/**
 * Atomically increment today's chatbot usage and return whether the request is
 * allowed. Identifier should be a stable guest id (or vendor id) when
 * available, otherwise a hashed IP so unauthenticated traffic still has a cap.
 */
export async function enforceChatbotLimit(
  pool: Pool,
  weddingId: string,
  identifier: string,
  botType: BotType,
  ip: string
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  // Prefer a stable identifier; fall back to hashed IP.
  const id = identifier || `ip:${hashIp(ip)}`;

  const result = await pool.query(
    `INSERT INTO chatbot_usage (wedding_id, identifier, bot_type, usage_date, count)
     VALUES ($1, $2, $3, CURRENT_DATE, 1)
     ON CONFLICT (wedding_id, identifier, bot_type, usage_date)
     DO UPDATE SET count = chatbot_usage.count + 1
     RETURNING count`,
    [weddingId, id, botType]
  );

  const count = result.rows[0].count as number;
  const remaining = Math.max(0, DAILY_CHATBOT_LIMIT - count);
  return {
    allowed: count <= DAILY_CHATBOT_LIMIT,
    remaining,
    limit: DAILY_CHATBOT_LIMIT,
  };
}
