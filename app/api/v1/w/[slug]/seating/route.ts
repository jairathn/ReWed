import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
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

    // Get guest's seating assignment
    const seatResult = await pool.query(
      `SELECT sa.table_name, sa.seat_number
       FROM seating_assignments sa
       WHERE sa.wedding_id = $1 AND sa.guest_id = $2`,
      [session.weddingId, session.guestId]
    );

    if (seatResult.rows.length === 0) {
      return Response.json({ data: { assigned: false } });
    }

    const { table_name, seat_number } = seatResult.rows[0];

    // Get all tablemates
    const tablematesResult = await pool.query(
      `SELECT g.id, g.first_name, g.last_name, g.display_name, g.group_label, g.instagram_handle,
              sa.seat_number,
              ir.question_key, ir.answer
       FROM seating_assignments sa
       JOIN guests g ON sa.guest_id = g.id
       LEFT JOIN icebreaker_responses ir ON ir.guest_id = g.id AND ir.wedding_id = sa.wedding_id
       WHERE sa.wedding_id = $1 AND sa.table_name = $2
       ORDER BY sa.seat_number ASC NULLS LAST, g.first_name ASC`,
      [session.weddingId, table_name]
    );

    const tablemates = tablematesResult.rows.map(r => ({
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      display_name: r.display_name,
      group_label: r.group_label,
      instagram_handle: r.instagram_handle,
      seat_number: r.seat_number,
      icebreaker: r.question_key ? { question: r.question_key, answer: r.answer } : null,
      is_you: r.id === session.guestId,
    }));

    await trackActivity(pool, {
      weddingId: session.weddingId,
      guestId: session.guestId,
      eventType: 'table_viewed',
    });

    return Response.json({
      data: {
        assigned: true,
        table_name,
        seat_number,
        tablemates,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
