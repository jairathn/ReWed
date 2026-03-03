export async function GET() {
  const checks: Record<string, { ok: boolean; latency_ms?: number; error?: string }> = {};

  // Database check
  try {
    const start = Date.now();
    const { getPool } = await import('@/lib/db/client');
    const pool = getPool();
    await pool.query('SELECT 1');
    checks.database = { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    checks.database = { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }

  const healthy = Object.values(checks).every((c) => c.ok);

  return Response.json(
    {
      status: healthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
