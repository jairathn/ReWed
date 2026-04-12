import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { getMediaUrl } from '@/lib/storage/r2';
import { feedPostSchema, sanitizeText } from '@/lib/validation';
import { AppError, handleApiError } from '@/lib/errors';

// GET /api/v1/w/[slug]/feed — list posts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
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

    const url = new URL(request.url);

    // Get wedding timezone
    const tzResult = await pool.query(
      `SELECT timezone FROM weddings WHERE id = $1`,
      [session.weddingId]
    );
    const tz = tzResult.rows[0]?.timezone || 'America/New_York';

    // Check if current time falls within any event
    const nowResult = await pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM events
        WHERE wedding_id = $1
          AND date IS NOT NULL
          AND start_time IS NOT NULL
          AND end_time IS NOT NULL
          AND (NOW() AT TIME ZONE $2) >= (date + start_time)
          AND (NOW() AT TIME ZONE $2) <= (COALESCE(end_date, date) + end_time)
      ) as is_during_event`,
      [session.weddingId, tz]
    );

    const isDuringEvent = nowResult.rows[0]?.is_during_event === true;

    // Get current/next event name for the blocked message
    let currentEventName = '';
    if (isDuringEvent) {
      const eventResult = await pool.query(
        `SELECT name FROM events
         WHERE wedding_id = $1
           AND date IS NOT NULL
           AND start_time IS NOT NULL
           AND end_time IS NOT NULL
           AND (NOW() AT TIME ZONE $2) >= (date + start_time)
           AND (NOW() AT TIME ZONE $2) <= (COALESCE(end_date, date) + end_time)
         LIMIT 1`,
        [session.weddingId, tz]
      );
      currentEventName = eventResult.rows[0]?.name || 'the event';
    }

    // Parse pagination
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

    const conditions = ['p.wedding_id = $1', 'p.is_hidden = FALSE'];
    const queryParams: (string | number)[] = [session.weddingId];
    let paramIndex = 2;

    if (cursor) {
      conditions.push(`p.created_at < $${paramIndex}`);
      queryParams.push(cursor);
      paramIndex++;
    }

    queryParams.push(limit + 1);

    const result = await pool.query(
      `SELECT p.id, p.type, p.content, p.photo_key, p.video_key, p.media_type,
              p.like_count, p.comment_count, p.is_pinned, p.created_at,
              g.id as guest_id, g.first_name, g.last_name, g.display_name
       FROM feed_posts p
       JOIN guests g ON p.guest_id = g.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.is_pinned DESC, p.created_at DESC
       LIMIT $${paramIndex}`,
      queryParams
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);

    // Check if current user has liked each post
    let likedPostIds: Set<string> = new Set();
    if (rows.length > 0) {
      const postIds = rows.map((r) => r.id);
      const likesResult = await pool.query(
        `SELECT post_id FROM feed_likes WHERE guest_id = $1 AND post_id = ANY($2)`,
        [session.guestId, postIds]
      );
      likedPostIds = new Set(likesResult.rows.map((r) => r.post_id));
    }

    const posts = await Promise.all(rows.map(async (row) => ({
      id: row.id,
      type: row.type,
      content: row.content,
      photo_url: row.photo_key ? await getMediaUrl(row.photo_key) : null,
      video_url: row.video_key ? await getMediaUrl(row.video_key) : null,
      media_type: row.media_type || null,
      like_count: row.like_count,
      comment_count: row.comment_count,
      is_pinned: row.is_pinned,
      is_liked: likedPostIds.has(row.id),
      guest: {
        id: row.guest_id,
        first_name: row.first_name,
        last_name: row.last_name,
        display_name: row.display_name,
      },
      created_at: row.created_at,
    })));

    return Response.json({
      data: {
        items: posts,
        next_cursor: hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null,
        has_more: hasMore,
      },
      is_blocked: isDuringEvent,
      blocked_message: isDuringEvent
        ? `Put your phone down and enjoy ${currentEventName}! The feed will be back after the event.`
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/v1/w/[slug]/feed — create a post
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
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

    // Check social feed is enabled
    const weddingResult = await pool.query(
      `SELECT id, package_config FROM weddings WHERE slug = $1`,
      [slug]
    );
    if (weddingResult.rows.length === 0) {
      throw new AppError('WEDDING_NOT_FOUND');
    }
    if (weddingResult.rows[0].id !== session.weddingId) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    const pkgConfig = weddingResult.rows[0].package_config || {};
    if (pkgConfig.social_feed === false) {
      throw new AppError('BILLING_FEATURE_LOCKED');
    }

    // Block posting during events
    const tzResult2 = await pool.query(`SELECT timezone FROM weddings WHERE id = $1`, [session.weddingId]);
    const tz2 = tzResult2.rows[0]?.timezone || 'America/New_York';

    const blockResult = await pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM events
        WHERE wedding_id = $1
          AND date IS NOT NULL AND start_time IS NOT NULL AND end_time IS NOT NULL
          AND (NOW() AT TIME ZONE $2) >= (date + start_time)
          AND (NOW() AT TIME ZONE $2) <= (COALESCE(end_date, date) + end_time)
      ) as blocked`,
      [session.weddingId, tz2]
    );

    if (blockResult.rows[0]?.blocked === true) {
      return Response.json(
        { error: { code: 'FEED_BLOCKED', message: "Put your phone down and enjoy the moment! The feed will be back after the event." } },
        { status: 403 }
      );
    }

    // Validate body
    const body = await request.json();
    const parsed = feedPostSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid post');
    }

    const { type, content, photo_upload_id } = parsed.data;

    // Sanitize content
    const sanitizedContent = content ? sanitizeText(content) : null;

    // If photo/video post, get the storage key from the upload
    let photoKey: string | null = null;
    let videoKey: string | null = null;
    let mediaType: 'photo' | 'video' | null = null;
    if (photo_upload_id) {
      const uploadResult = await pool.query(
        `SELECT storage_key, type FROM uploads
         WHERE id = $1 AND wedding_id = $2 AND guest_id = $3 AND status = 'ready'`,
        [photo_upload_id, session.weddingId, session.guestId]
      );
      if (uploadResult.rows.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Photo not found');
      }
      const uploadType = uploadResult.rows[0].type;
      if (uploadType === 'video') {
        videoKey = uploadResult.rows[0].storage_key;
        mediaType = 'video';
      } else {
        photoKey = uploadResult.rows[0].storage_key;
        mediaType = 'photo';
      }
    }

    const result = await pool.query(
      `INSERT INTO feed_posts (wedding_id, guest_id, type, content, photo_key, video_key, media_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, type, content, photo_key, video_key, media_type, like_count, comment_count, is_pinned, created_at`,
      [session.weddingId, session.guestId, type, sanitizedContent, photoKey, videoKey, mediaType]
    );

    const post = result.rows[0];

    // Get guest info for response
    const guestResult = await pool.query(
      `SELECT id, first_name, last_name, display_name FROM guests WHERE id = $1`,
      [session.guestId]
    );
    const guest = guestResult.rows[0];

    return Response.json(
      {
        data: {
          post: {
            id: post.id,
            type: post.type,
            content: post.content,
            photo_url: post.photo_key ? await getMediaUrl(post.photo_key) : null,
            video_url: post.video_key ? await getMediaUrl(post.video_key) : null,
            media_type: post.media_type || null,
            like_count: post.like_count,
            comment_count: post.comment_count,
            is_pinned: post.is_pinned,
            is_liked: false,
            guest: {
              id: guest.id,
              first_name: guest.first_name,
              last_name: guest.last_name,
              display_name: guest.display_name,
            },
            created_at: post.created_at,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
