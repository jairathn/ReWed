import type { PoolClient } from 'pg';

export interface QuotaResult {
  allowed: boolean;
  remaining: number;
  used: number;
  message?: string;
}

export async function checkPortraitQuota(
  client: PoolClient,
  params: { weddingId: string; guestId: string; perGuestLimit: number }
): Promise<QuotaResult> {
  const { weddingId, guestId, perGuestLimit } = params;

  const result = await client.query(
    `SELECT COUNT(*) as count FROM ai_jobs
     WHERE wedding_id = $1 AND guest_id = $2 AND type = 'portrait'
     AND status IN ('completed', 'processing')`,
    [weddingId, guestId]
  );

  const used = parseInt(result.rows[0].count, 10);
  const remaining = Math.max(0, perGuestLimit - used);

  if (used >= perGuestLimit) {
    return {
      allowed: false,
      remaining: 0,
      used,
      message: `You've used all ${perGuestLimit} of your portraits! Each one is a keepsake.`,
    };
  }

  return {
    allowed: true,
    remaining,
    used,
  };
}
