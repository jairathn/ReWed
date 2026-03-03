import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { sanitizeText } from '@/lib/validation';
import { AppError, handleApiError } from '@/lib/errors';

const commentSchema = z.object({
  content: z.string().min(1).max(500),
});

// GET /api/v1/w/[slug]/feed/[postId]/comments — list comments
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; postId: string }> }
) {
  try {
    const { postId } = await params;
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

    // Verify post belongs to this wedding
    const postResult = await pool.query(
      `SELECT id, wedding_id FROM feed_posts WHERE id = $1`,
      [postId]
    );
    if (postResult.rows.length === 0) {
      throw new AppError('FEED_POST_HIDDEN');
    }
    if (postResult.rows[0].wedding_id !== session.weddingId) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

    const conditions = ['c.post_id = $1'];
    const queryParams: (string | number)[] = [postId];
    let paramIndex = 2;

    if (cursor) {
      conditions.push(`c.created_at > $${paramIndex}`);
      queryParams.push(cursor);
      paramIndex++;
    }

    queryParams.push(limit + 1);

    const result = await pool.query(
      `SELECT c.id, c.content, c.created_at,
              g.id as guest_id, g.first_name, g.last_name, g.display_name
       FROM feed_comments c
       JOIN guests g ON c.guest_id = g.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.created_at ASC
       LIMIT $${paramIndex}`,
      queryParams
    );

    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);

    const comments = rows.map((row) => ({
      id: row.id,
      content: row.content,
      guest: {
        id: row.guest_id,
        first_name: row.first_name,
        last_name: row.last_name,
        display_name: row.display_name,
      },
      created_at: row.created_at,
    }));

    return Response.json({
      data: {
        items: comments,
        next_cursor: hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null,
        has_more: hasMore,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST /api/v1/w/[slug]/feed/[postId]/comments — add a comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; postId: string }> }
) {
  try {
    const { postId } = await params;
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

    // Verify post belongs to this wedding and is not hidden
    const postResult = await pool.query(
      `SELECT id, wedding_id, is_hidden FROM feed_posts WHERE id = $1`,
      [postId]
    );
    if (postResult.rows.length === 0 || postResult.rows[0].is_hidden) {
      throw new AppError('FEED_POST_HIDDEN');
    }
    if (postResult.rows[0].wedding_id !== session.weddingId) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    // Validate body
    const body = await request.json();
    const parsed = commentSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }

    const sanitizedContent = sanitizeText(parsed.data.content);

    const result = await pool.query(
      `INSERT INTO feed_comments (post_id, guest_id, wedding_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, content, created_at`,
      [postId, session.guestId, session.weddingId, sanitizedContent]
    );

    // Increment comment count
    await pool.query(
      `UPDATE feed_posts SET comment_count = comment_count + 1 WHERE id = $1`,
      [postId]
    );

    // Get guest info
    const guestResult = await pool.query(
      `SELECT id, first_name, last_name, display_name FROM guests WHERE id = $1`,
      [session.guestId]
    );

    const comment = result.rows[0];
    const guest = guestResult.rows[0];

    return Response.json(
      {
        data: {
          comment: {
            id: comment.id,
            content: comment.content,
            guest: {
              id: guest.id,
              first_name: guest.first_name,
              last_name: guest.last_name,
              display_name: guest.display_name,
            },
            created_at: comment.created_at,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
