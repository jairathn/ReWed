import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { AppError, handleApiError } from '@/lib/errors';

// POST /api/v1/w/[slug]/feed/[postId]/like — toggle like
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

    // Verify post exists and belongs to this wedding
    const postResult = await pool.query(
      `SELECT id, wedding_id, like_count, is_hidden FROM feed_posts WHERE id = $1`,
      [postId]
    );
    if (postResult.rows.length === 0 || postResult.rows[0].is_hidden) {
      throw new AppError('FEED_POST_HIDDEN');
    }
    if (postResult.rows[0].wedding_id !== session.weddingId) {
      throw new AppError('AUTH_NOT_REGISTERED');
    }

    // Check if already liked
    const existingLike = await pool.query(
      `SELECT id FROM feed_likes WHERE post_id = $1 AND guest_id = $2`,
      [postId, session.guestId]
    );

    let liked: boolean;
    let likeCount: number;

    if (existingLike.rows.length > 0) {
      // Unlike
      await pool.query(
        `DELETE FROM feed_likes WHERE post_id = $1 AND guest_id = $2`,
        [postId, session.guestId]
      );
      const updated = await pool.query(
        `UPDATE feed_posts SET like_count = GREATEST(0, like_count - 1) WHERE id = $1 RETURNING like_count`,
        [postId]
      );
      liked = false;
      likeCount = updated.rows[0].like_count;
    } else {
      // Like
      await pool.query(
        `INSERT INTO feed_likes (post_id, guest_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [postId, session.guestId]
      );
      const updated = await pool.query(
        `UPDATE feed_posts SET like_count = like_count + 1 WHERE id = $1 RETURNING like_count`,
        [postId]
      );
      liked = true;
      likeCount = updated.rows[0].like_count;
    }

    return Response.json({
      data: { liked, like_count: likeCount },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
