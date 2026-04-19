import { NextRequest } from 'next/server';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { runIngestBatch, runIncrementalRefresh } from '@/lib/google/ingest';

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/google/ingest
 *
 * Runs one batch of the knowledge-base pipeline. Idempotent. The UI calls
 * this in a loop (polling every couple seconds) until phase === 'done'.
 *
 * Body (optional):
 *   { from_date?: "YYYY-MM-DD" }
 *
 * If `from_date` is provided and the connection doesn't yet have a backfill
 * window set, we set it here. Default backfill window on first call: 365
 * days back from today — gives a year of prior planning context.
 *
 * Also supports an "incremental" mode which pulls only threads newer than
 * last_synced_at — meant for the "refresh" button once backfill is done.
 *   { mode: "incremental" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json().catch(() => ({}));
    const mode = typeof body.mode === 'string' ? body.mode : 'batch';
    const fromDateParam = typeof body.from_date === 'string' ? body.from_date : null;

    const pool = getPool();

    // Make sure the connection row exists and Google is wired.
    const connRes = await pool.query<{
      gmail_enabled: boolean;
      backfill_from_date: string | null;
    }>(
      `SELECT gmail_enabled, backfill_from_date
       FROM google_connections WHERE wedding_id = $1`,
      [weddingId]
    );
    if (connRes.rows.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Connect Google first.');
    }
    if (!connRes.rows[0].gmail_enabled) {
      throw new AppError('VALIDATION_ERROR', 'Gmail scope not granted.');
    }

    // Initialize backfill window on first run. If the caller supplied a
    // from_date (e.g. a specific engagement date), honor that; otherwise
    // default to one year back.
    if (!connRes.rows[0].backfill_from_date) {
      const defaultFrom = new Date();
      defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 365);
      const initial = fromDateParam ?? defaultFrom.toISOString().slice(0, 10);
      await pool.query(
        `UPDATE google_connections
         SET backfill_from_date = $1
         WHERE wedding_id = $2`,
        [initial, weddingId]
      );
    }

    // Pull context the extractor needs: wedding name + known vendor names.
    const [weddingRow, vendorRows] = await Promise.all([
      pool.query<{ display_name: string }>(
        `SELECT display_name FROM weddings WHERE id = $1`,
        [weddingId]
      ),
      pool.query<{ name: string }>(
        `SELECT name FROM vendors WHERE wedding_id = $1`,
        [weddingId]
      ),
    ]);
    if (weddingRow.rows.length === 0) throw new AppError('WEDDING_NOT_FOUND');

    const weddingName = weddingRow.rows[0].display_name;
    const vendorNames = vendorRows.rows.map((r) => r.name);

    if (mode === 'incremental') {
      const refresh = await runIncrementalRefresh(pool, weddingId);
      // Then immediately extract any newly-discovered threads.
      const result = await runIngestBatch(pool, weddingId, {
        weddingName,
        vendorNames,
      });
      return Response.json({
        data: {
          mode: 'incremental',
          discovered: refresh.discovered,
          ...result,
        },
      });
    }

    const result = await runIngestBatch(pool, weddingId, {
      weddingName,
      vendorNames,
    });
    return Response.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
