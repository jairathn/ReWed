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

    // Parse pagination
    const url = new URL(request.url);
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
      `SELECT p.id, p.type, p.content, p.photo_key, p.like_count, p.comment_count,
              p.is_pinned, p.created_at,
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

    // Validate body
    const body = await request.json();
    const parsed = feedPostSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Invalid post');
    }

    const { type, content, photo_upload_id } = parsed.data;

    // Sanitize content
    const sanitizedContent = content ? sanitizeText(content) : null;

    // If photo post, get the storage key from the upload
    let photoKey: string | null = null;
    if (photo_upload_id) {
      const uploadResult = await pool.query(
        `SELECT storage_key FROM uploads
         WHERE id = $1 AND wedding_id = $2 AND guest_id = $3 AND status = 'ready'`,
        [photo_upload_id, session.weddingId, session.guestId]
      );
      if (uploadResult.rows.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'Photo not found');
      }
      photoKey = uploadResult.rows[0].storage_key;
    }

    const result = await pool.query(
      `INSERT INTO feed_posts (wedding_id, guest_id, type, content, photo_key)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, type, content, photo_key, like_count, comment_count, is_pinned, created_at`,
      [session.weddingId, session.guestId, type, sanitizedContent, photoKey]
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
