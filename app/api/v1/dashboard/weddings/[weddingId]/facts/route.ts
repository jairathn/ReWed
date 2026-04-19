import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/facts
 *
 * Facts browser — backs a small UI so the couple can see what got extracted
 * from their inbox (and trust/debug it) without exposing raw email bodies.
 *
 * Query params:
 *   vendor  — filter by exact vendor_name
 *   limit   — page size (default 40, max 100)
 *   cursor  — ISO timestamp for pagination ("before this fact_date")
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const url = new URL(request.url);
    const vendor = url.searchParams.get('vendor');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '40', 10) || 40, 100);
    const cursor = url.searchParams.get('cursor');

    const pool = getPool();

    const conditions: string[] = ['wedding_id = $1'];
    const values: unknown[] = [weddingId];
    if (vendor) {
      conditions.push(`vendor_name = $${values.length + 1}`);
      values.push(vendor);
    }
    if (cursor) {
      conditions.push(`fact_date < $${values.length + 1}`);
      values.push(new Date(cursor));
    }
    values.push(limit + 1);

    const rows = await pool.query(
      `SELECT id, source_type, source_ref, vendor_name, topic, summary,
              decisions, open_questions, action_items, amounts, fact_date,
              extracted_at, model
       FROM wedding_facts
       WHERE ${conditions.join(' AND ')}
       ORDER BY fact_date DESC NULLS LAST, extracted_at DESC
       LIMIT $${values.length}`,
      values
    );

    // Vendor breakdown counts across the whole wedding (for a sidebar/legend).
    const vendorCounts = await pool.query(
      `SELECT COALESCE(vendor_name, '(unassigned)') AS vendor_name, COUNT(*)::int AS count
       FROM wedding_facts
       WHERE wedding_id = $1
       GROUP BY vendor_name
       ORDER BY count DESC
       LIMIT 40`,
      [weddingId]
    );

    const hasMore = rows.rowCount !== null && rows.rowCount > limit;
    const page = hasMore ? rows.rows.slice(0, limit) : rows.rows;
    const nextCursor =
      hasMore && page.length > 0
        ? (page[page.length - 1].fact_date as string | null)
        : null;

    return Response.json({
      data: {
        facts: page,
        next_cursor: nextCursor,
        vendors: vendorCounts.rows,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
