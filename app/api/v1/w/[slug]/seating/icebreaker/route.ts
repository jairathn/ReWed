import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
import { trackActivity } from '@/lib/activity';
import { sanitizeText } from '@/lib/validation';
import { handleApiError, AppError } from '@/lib/errors';

const icebreakerSchema = z.object({
  question_key: z.string().min(1).max(50),
  answer: z.string().min(1).max(200),
});

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
    const parsed = icebreakerSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message);
    }

    const sanitizedAnswer = sanitizeText(parsed.data.answer);

    await pool.query(
      `INSERT INTO icebreaker_responses (wedding_id, guest_id, question_key, answer)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (wedding_id, guest_id)
       DO UPDATE SET question_key = $3, answer = $4`,
      [session.weddingId, session.guestId, parsed.data.question_key, sanitizedAnswer]
    );

    await trackActivity(pool, {
      weddingId: session.weddingId,
      guestId: session.guestId,
      eventType: 'icebreaker_answered',
    });

    return Response.json({ data: { saved: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
