import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { getMediaUrl } from '@/lib/storage/r2';
import { trackActivity } from '@/lib/activity';
import { handleApiError, AppError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await params;
    const pool = getPool();

    const sessionToken = request.cookies.get('wedding_session')?.value;
    if (!sessionToken) throw new AppError('AUTH_NOT_REGISTERED');

    const session = await validateSession(pool, sessionToken);
    if (!session) throw new AppError('AUTH_TOKEN_EXPIRED');

    const url = new URL(request.url);
    const typeFilter = url.searchParams.get('type');
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10), 100);

    const conditions: string[] = ['u.wedding_id = $1', "u.status = 'ready'"];
    const queryParams: (string | number)[] = [session.weddingId];
    let paramIndex = 2;

    if (typeFilter && ['photo', 'video'].includes(typeFilter)) {
      conditions.push(`u.type = $${paramIndex}`);
      queryParams.push(typeFilter);
      paramIndex++;
    }

    if (cursor) {
      conditions.push(`u.created_at < $${paramIndex}`);
      queryParams.push(cursor);
      paramIndex++;
    }

    queryParams.push(limit + 1);

    const result = await pool.query(
      `SELECT u.id, u.type, u.storage_key, u.thumbnail_key, u.duration_ms, u.prompt_answered, u.created_at,
              g.id as guest_id, g.first_name, g.last_name, g.display_name
       FROM uploads u
       JOIN guests g ON u.guest_id = g.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.created_at DESC
       LIMIT $${paramIndex}`,
      queryParams
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);

    // Get total count (for display)
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM uploads WHERE wedding_id = $1 AND status = 'ready'`,
      [session.weddingId]
    );

    const items = await Promise.all(rows.map(async (row) => ({
      id: row.id,
      type: row.type,
      url: await getMediaUrl(row.storage_key),
      thumbnail_url: await getMediaUrl(row.thumbnail_key || row.storage_key),
      duration_ms: row.duration_ms || null,
      prompt_answered: row.prompt_answered || null,
      guest: {
        id: row.guest_id,
        first_name: row.first_name,
        display_name: row.display_name,
      },
      created_at: row.created_at,
    })));

    await trackActivity(pool, {
      weddingId: session.weddingId,
      guestId: session.guestId,
      eventType: 'shared_gallery_viewed',
    });

    return Response.json({
      data: {
        items,
        total_count: parseInt(countResult.rows[0].total),
        next_cursor: hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null,
        has_more: hasMore,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
