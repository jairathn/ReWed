import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { getMediaUrl } from '@/lib/storage/r2';

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/gallery-curation
 * List all ready photos with approval status for the couple to curate
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
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '60', 10), 200);
    const filter = url.searchParams.get('filter'); // 'approved', 'rejected', or null for all

    const pool = getPool();
    const conditions: string[] = [
      'u.wedding_id = $1',
      "u.status = 'ready'",
      "u.type = 'photo'",
    ];
    const queryParams: (string | number)[] = [weddingId];
    let paramIndex = 2;

    if (filter === 'approved') {
      conditions.push('u.couple_approved = TRUE');
    } else if (filter === 'rejected') {
      conditions.push('u.couple_approved = FALSE');
    }

    if (cursor) {
      conditions.push(`u.created_at < $${paramIndex}`);
      queryParams.push(cursor);
      paramIndex++;
    }

    queryParams.push(limit + 1);

    const result = await pool.query(
      `SELECT u.id, u.storage_key, u.thumbnail_key, u.couple_approved, u.created_at,
              g.first_name, g.last_name, g.display_name
       FROM uploads u
       JOIN guests g ON u.guest_id = g.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.created_at DESC
       LIMIT $${paramIndex}`,
      queryParams
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);

    const items = await Promise.all(rows.map(async (r: Record<string, unknown>) => ({
      id: r.id,
      thumbnail_url: await getMediaUrl((r.thumbnail_key || r.storage_key) as string),
      url: await getMediaUrl(r.storage_key as string),
      couple_approved: r.couple_approved,
      guest_name: r.display_name || `${r.first_name} ${r.last_name}`,
      created_at: r.created_at,
    })));

    // Get counts
    const countsResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE couple_approved = TRUE) as approved,
         COUNT(*) FILTER (WHERE couple_approved = FALSE) as rejected,
         COUNT(*) as total
       FROM uploads
       WHERE wedding_id = $1 AND status = 'ready' AND type = 'photo'`,
      [weddingId]
    );
    const counts = countsResult.rows[0];

    return Response.json({
      data: {
        items,
        counts: {
          approved: parseInt(counts.approved),
          rejected: parseInt(counts.rejected),
          total: parseInt(counts.total),
        },
        next_cursor: hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null,
        has_more: hasMore,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/gallery-curation
 * Toggle approval for one or multiple photos
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const { upload_ids, approved } = body;

    if (!Array.isArray(upload_ids) || upload_ids.length === 0 || typeof approved !== 'boolean') {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'upload_ids (array) and approved (boolean) required' } },
        { status: 400 }
      );
    }

    // Cap batch size
    const ids = upload_ids.slice(0, 200);

    const pool = getPool();
    const placeholders = ids.map((_: string, i: number) => `$${i + 3}`).join(', ');
    await pool.query(
      `UPDATE uploads SET couple_approved = $1
       WHERE wedding_id = $2 AND id IN (${placeholders})`,
      [approved, weddingId, ...ids]
    );

    return Response.json({ data: { success: true, updated: ids.length } });
  } catch (error) {
    return handleApiError(error);
  }
}
