import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { isGoogleConfigured } from '@/lib/google/oauth';

/**
 * GET — return current Google connection status (for the dashboard card).
 * DELETE — disconnect: drop tokens. Couple can reconnect later.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    const [connRes, knowledgeRes] = await Promise.all([
      pool.query(
        `SELECT email, gmail_enabled, drive_enabled, last_scanned_at, last_drive_scanned_at,
                connected_at, backfill_from_date, backfill_completed_at, last_synced_at,
                backfill_page_token
         FROM google_connections WHERE wedding_id = $1`,
        [weddingId]
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM email_threads WHERE wedding_id = $1) AS thread_count,
           (SELECT COUNT(*)::int FROM email_threads
              WHERE wedding_id = $1 AND extracted_at IS NOT NULL) AS extracted_count,
           (SELECT COUNT(*)::int FROM wedding_facts
              WHERE wedding_id = $1 AND source_type = 'email') AS fact_count`,
        [weddingId]
      ),
    ]);

    const k = knowledgeRes.rows[0] ?? { thread_count: 0, extracted_count: 0, fact_count: 0 };

    return Response.json({
      data: {
        configured: isGoogleConfigured(),
        connected: connRes.rows.length > 0,
        connection: connRes.rows[0] || null,
        knowledge: {
          thread_count: k.thread_count,
          extracted_count: k.extracted_count,
          fact_count: k.fact_count,
          unextracted_count: Math.max(0, (k.thread_count as number) - (k.extracted_count as number)),
        },
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    await pool.query(
      `DELETE FROM google_connections WHERE wedding_id = $1`,
      [weddingId]
    );
    return Response.json({ data: { ok: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
