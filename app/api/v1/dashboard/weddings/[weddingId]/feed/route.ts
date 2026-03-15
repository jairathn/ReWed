import { NextRequest } from 'next/server';
import { handleApiError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { getCdnUrl } from '@/lib/storage/r2';

/**
 * GET /api/v1/dashboard/weddings/[weddingId]/feed
 * Returns feed posts for the couple's moderation dashboard.
 * Includes hidden posts so they can be un-hidden.
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
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);

    const conditions = ['p.wedding_id = $1'];
    const queryParams: (string | number)[] = [weddingId];
    let paramIndex = 2;

    if (cursor) {
      conditions.push(`p.created_at < $${paramIndex}`);
      queryParams.push(cursor);
      paramIndex++;
    }

    queryParams.push(limit + 1);

    const result = await pool.query(
      `SELECT p.id, p.type, p.content, p.photo_key, p.like_count, p.comment_count,
              p.is_pinned, p.is_hidden, p.created_at,
              g.id as guest_id, g.first_name, g.last_name, g.display_name
       FROM feed_posts p
       JOIN guests g ON p.guest_id = g.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT $${paramIndex}`,
      queryParams
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);

    const posts = rows.map((row) => ({
      id: row.id,
      type: row.type,
      content: row.content,
      photo_url: row.photo_key ? getCdnUrl(row.photo_key) : null,
      like_count: row.like_count,
      comment_count: row.comment_count,
      is_pinned: row.is_pinned,
      is_hidden: row.is_hidden,
      guest: {
        id: row.guest_id,
        display_name: row.display_name,
        first_name: row.first_name,
        last_name: row.last_name,
      },
      created_at: row.created_at,
    }));

    return Response.json({
      data: {
        items: posts,
        next_cursor: hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null,
        has_more: hasMore,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * PATCH /api/v1/dashboard/weddings/[weddingId]/feed
 * Moderate a post: pin/unpin, hide/unhide.
 * Body: { post_id, action: 'pin' | 'unpin' | 'hide' | 'unhide' | 'delete' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const pool = getPool();
    const { post_id, action } = await request.json();

    if (!post_id || !action) {
      return Response.json({ error: { message: 'post_id and action required' } }, { status: 400 });
    }

    switch (action) {
      case 'pin':
        await pool.query('UPDATE feed_posts SET is_pinned = TRUE WHERE id = $1 AND wedding_id = $2', [post_id, weddingId]);
        break;
      case 'unpin':
        await pool.query('UPDATE feed_posts SET is_pinned = FALSE WHERE id = $1 AND wedding_id = $2', [post_id, weddingId]);
        break;
      case 'hide':
        await pool.query('UPDATE feed_posts SET is_hidden = TRUE WHERE id = $1 AND wedding_id = $2', [post_id, weddingId]);
        break;
      case 'unhide':
        await pool.query('UPDATE feed_posts SET is_hidden = FALSE WHERE id = $1 AND wedding_id = $2', [post_id, weddingId]);
        break;
      case 'delete':
        await pool.query('DELETE FROM feed_posts WHERE id = $1 AND wedding_id = $2', [post_id, weddingId]);
        break;
      default:
        return Response.json({ error: { message: 'Invalid action' } }, { status: 400 });
    }

    return Response.json({ data: { success: true, action, post_id } });
  } catch (error) {
    return handleApiError(error);
  }
}
