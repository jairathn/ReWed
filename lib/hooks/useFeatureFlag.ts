'use client';

import { useEffect, useState } from 'react';

/**
 * Client-side feature flag check. Resolves to `true` if the per-wedding
 * override in weddings.package_config.feature_flags[flag] is `true`, OR if
 * the server-side env default is on.
 *
 * Cached per (weddingId, flag) in module scope so multiple components asking
 * for the same flag don't hammer the API. SWR/React-Query would be cleaner;
 * the current codebase doesn't use either and this is small enough.
 */
type Cache = Map<string, boolean>;
const cache: Cache = new Map();
const inflight = new Map<string, Promise<boolean>>();

async function fetchFlag(weddingId: string, flag: string): Promise<boolean> {
  const key = `${weddingId}::${flag}`;
  if (cache.has(key)) return cache.get(key)!;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = (async () => {
    try {
      const res = await fetch(
        `/api/v1/dashboard/weddings/${weddingId}/feature-flag?flag=${encodeURIComponent(flag)}`
      );
      if (!res.ok) return false;
      const json = await res.json();
      const enabled = Boolean(json?.data?.enabled);
      cache.set(key, enabled);
      return enabled;
    } catch {
      return false;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export function useFeatureFlag(weddingId: string, flag: string): {
  enabled: boolean;
  loading: boolean;
} {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetchFlag(weddingId, flag).then((v) => {
      if (cancelled) return;
      setEnabled(v);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [weddingId, flag]);
  return { enabled, loading };
}
