import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { getMediaUrl } from '@/lib/storage/r2';
import { AppError, handleApiError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; guestId: string }> }
) {
  try {
    const { slug, guestId } = await params;
    const pool = getPool();

    // Validate guest session
    const sessionToken = request.cookies.get('wedding_session')?.value;
    if (!sessionToken) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    const session = await validateSession(pool, sessionToken);
    if (!session) {
      throw new AppError('AUTH_TOKEN_EXPIRED');
    }

    // Verify wedding
    const weddingResult = await pool.query(
      `SELECT id FROM weddings WHERE slug = $1`,
      [slug]
    );
    if (weddingResult.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND');
    }
    if (weddingResult.rows[0].id !== session.weddingId) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    // Parse query params
    const url = new URL(request.url);
    const typeFilter = url.searchParams.get('type');
    const eventId = url.searchParams.get('event_id');
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

    // Build query for uploads
    const conditions: string[] = ['u.wedding_id = $1', 'u.guest_id = $2', "u.status = 'ready'"];
    const queryParams: (string | number)[] = [session.weddingId, guestId];
    let paramIndex = 3;

    const isFavoriteFilter = typeFilter === 'favorite';

    if (typeFilter && ['photo', 'video'].includes(typeFilter)) {
      conditions.push(`u.type = $${paramIndex}`);
      queryParams.push(typeFilter);
      paramIndex++;
    }

    if (isFavoriteFilter) {
      conditions.push(`EXISTS (SELECT 1 FROM favorites fav WHERE fav.upload_id = u.id AND fav.guest_id = u.guest_id)`);
    }

    if (eventId) {
      conditions.push(`u.event_id = $${paramIndex}`);
      queryParams.push(eventId);
      paramIndex++;
    }

    if (cursor) {
      conditions.push(`u.created_at < $${paramIndex}`);
      queryParams.push(cursor);
      paramIndex++;
    }

    queryParams.push(limit + 1);

    const uploadsQuery = `
      SELECT u.id, u.type, u.storage_key, u.thumbnail_key, u.filter_applied,
             u.duration_ms, u.created_at, e.name as event_name,
             CASE WHEN f.id IS NOT NULL THEN true ELSE false END as favorited
      FROM uploads u
      LEFT JOIN events e ON u.event_id = e.id
      LEFT JOIN favorites f ON f.upload_id = u.id AND f.guest_id = u.guest_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex}
    `;

    const uploadsResult = await pool.query(uploadsQuery, queryParams);

    // Also get AI portraits for this guest
    let portraits: typeof uploadsResult.rows = [];
    if (!typeFilter || typeFilter === 'portrait') {
      const portraitConditions: string[] = [
        'a.wedding_id = $1',
        'a.guest_id = $2',
        "a.type = 'portrait'",
        "a.status = 'completed'",
        'a.output_key IS NOT NULL',
      ];
      const portraitParams: (string | number)[] = [session.weddingId, guestId];
      let pIdx = 3;

      if (cursor) {
        portraitConditions.push(`a.created_at < $${pIdx}`);
        portraitParams.push(cursor);
        pIdx++;
      }

      portraitParams.push(limit + 1);

      const portraitQuery = `
        SELECT a.id, 'portrait' as type, a.output_key as storage_key,
               a.output_key as thumbnail_key, a.style_id as filter_applied,
               NULL as duration_ms, a.created_at, NULL as event_name
        FROM ai_jobs a
        WHERE ${portraitConditions.join(' AND ')}
        ORDER BY a.created_at DESC
        LIMIT $${pIdx}
      `;

      const portraitResult = await pool.query(portraitQuery, portraitParams);
      portraits = portraitResult.rows;
    }

    // Merge and sort uploads + portraits
    const allItems = [...uploadsResult.rows, ...portraits]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit + 1);

    const hasMore = allItems.length > limit;
    const items = allItems.slice(0, limit);

    const mediaItems = await Promise.all(items.map(async (row) => ({
      id: row.id,
      type: row.type as 'photo' | 'video' | 'portrait',
      url: await getMediaUrl(row.storage_key),
      thumbnail_url: await getMediaUrl(row.thumbnail_key || row.storage_key),
      event_name: row.event_name || null,
      filter_applied: row.filter_applied || null,
      duration_ms: row.duration_ms || null,
      favorited: row.favorited === true,
      created_at: row.created_at,
    })));

    return Response.json({
      data: {
        items: mediaItems,
        next_cursor: hasMore && items.length > 0 ? items[items.length - 1].created_at : null,
        has_more: hasMore,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
