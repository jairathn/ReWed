import type { Pool } from 'pg';
import { getPool } from '@/lib/db/client';

/**
 * Lightweight feature flag check, three-tier precedence (highest to lowest):
 *
 *   1. Per-wedding override stored in weddings.package_config.feature_flags.<flag>
 *      — explicit true OR false wins over the env default.
 *   2. Environment-wide default in FLAG_<FLAG>_DEFAULT (e.g. FLAG_RICH_TEXT_V1_DEFAULT=true).
 *      Useful for fleet-wide rollouts without N per-wedding updates.
 *   3. Off.
 *
 * No new tables, no separate migration — package_config JSONB already exists.
 * If we ever want a UI for flag management, swap the JSONB read for a
 * dedicated table; the rest of the codebase stays unchanged.
 */
export async function isFlagEnabled(weddingId: string, flag: string, pool?: Pool): Promise<boolean> {
  const p = pool ?? getPool();
  const r = await p.query<{ flags: Record<string, unknown> | null }>(
    `SELECT COALESCE(package_config->'feature_flags', '{}'::jsonb) AS flags
     FROM weddings WHERE id = $1`,
    [weddingId]
  );
  const v = r.rows[0]?.flags?.[flag];
  if (v === true) return true;
  if (v === false) return false;
  // No per-wedding setting — fall back to env default.
  const envKey = `FLAG_${flag.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_DEFAULT`;
  return process.env[envKey] === 'true';
}

/** Synchronous variant for cases where the caller has already loaded the row. */
export function isFlagEnabledFromConfig(
  packageConfig: Record<string, unknown> | null | undefined,
  flag: string
): boolean {
  const flags = (packageConfig?.feature_flags ?? {}) as Record<string, unknown>;
  const v = flags[flag];
  if (v === true) return true;
  if (v === false) return false;
  const envKey = `FLAG_${flag.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_DEFAULT`;
  return process.env[envKey] === 'true';
}

/**
 * Set a per-wedding flag override. Pass `null` to clear (falls back to env default).
 */
export async function setFlag(
  weddingId: string,
  flag: string,
  value: boolean | null
): Promise<void> {
  const pool = getPool();
  if (value === null) {
    await pool.query(
      `UPDATE weddings
         SET package_config = package_config #- ARRAY['feature_flags', $2]
       WHERE id = $1`,
      [weddingId, flag]
    );
    return;
  }
  await pool.query(
    `UPDATE weddings
       SET package_config = jsonb_set(
         COALESCE(package_config, '{}'::jsonb),
         ARRAY['feature_flags'],
         COALESCE(package_config->'feature_flags', '{}'::jsonb)
           || jsonb_build_object($2::text, $3::boolean),
         true
       )
     WHERE id = $1`,
    [weddingId, flag, value]
  );
}
