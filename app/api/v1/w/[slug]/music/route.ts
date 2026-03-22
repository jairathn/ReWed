import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { trackActivity } from '@/lib/activity';
import { sanitizeText } from '@/lib/validation';
import { handleApiError, AppError } from '@/lib/errors';

const musicRequestSchema = z.object({
  song_title: z.string().min(1).max(300),
  artist: z.string().max(300).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const pool = getPool();

    const sessionToken = request.cookies.get('wedding_session')?.value;
    if (!sessionToken) throw new AppError('AUTH_NOT_REGISTERED');

    const session = await validateSession(pool, sessionToken);
    if (!session) throw new AppError('AUTH_TOKEN_EXPIRED');

    const result = await pool.query(
      `SELECT id, song_title, artist, created_at
       FROM music_requests
       WHERE wedding_id = $1 AND guest_id = $2
       ORDER BY created_at DESC`,
      [session.weddingId, session.guestId]
    );

    return Response.json({ data: { songs: result.rows } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const pool = getPool();

    const sessionToken = request.cookies.get('wedding_session')?.value;
    if (!sessionToken) throw new AppError('AUTH_NOT_REGISTERED');

    const session = await validateSession(pool, sessionToken);
    if (!session) throw new AppError('AUTH_TOKEN_EXPIRED');

    const body = await request.json();
    const parsed = musicRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }

    // Limit to 10 songs per guest
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM music_requests WHERE wedding_id = $1 AND guest_id = $2`,
      [session.weddingId, session.guestId]
    );
    if (parseInt(countResult.rows[0].count) >= 10) {
      throw new AppError('VALIDATION_ERROR', 'You can request up to 10 songs');
    }

    const result = await pool.query(
      `INSERT INTO music_requests (wedding_id, guest_id, song_title, artist)
       VALUES ($1, $2, $3, $4)
       RETURNING id, song_title, artist, created_at`,
      [session.weddingId, session.guestId, sanitizeText(parsed.data.song_title), parsed.data.artist ? sanitizeText(parsed.data.artist) : null]
    );

    await trackActivity(pool, {
      weddingId: session.weddingId,
      guestId: session.guestId,
      eventType: 'song_requested',
    });

    return Response.json({ data: { song: result.rows[0] } }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
