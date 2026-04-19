import type { Pool } from 'pg';
import { createHash } from 'crypto';

export const DAILY_CHATBOT_LIMIT = 20;
// Couple "expert" bot is the paying user's daily research tool — give it a
// looser cap. Still bounded so a runaway script can't burn through credits.
export const DAILY_EXPERT_LIMIT = 50;

export type BotType = 'guest' | 'vendor' | 'expert';

const LIMITS: Record<BotType, number> = {
  guest: DAILY_CHATBOT_LIMIT,
  vendor: DAILY_CHATBOT_LIMIT,
  expert: DAILY_EXPERT_LIMIT,
};

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
  const limit = LIMITS[botType];
  const remaining = Math.max(0, limit - count);
  return {
    allowed: count <= limit,
    remaining,
    limit,
  };
}
