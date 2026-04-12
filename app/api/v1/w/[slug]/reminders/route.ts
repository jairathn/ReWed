import { NextRequest } from 'next/server';
import { getPool } from '@/lib/db/client';
import { validateSession } from '@/lib/session';
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

    // Get wedding details
    const weddingResult = await pool.query(
      `SELECT id, timezone, config, wedding_date FROM weddings WHERE id = $1`,
      [session.weddingId]
    );
    const wedding = weddingResult.rows[0];
    const tz = wedding?.timezone || 'America/New_York';

    // Get upcoming events (next 7 days)
    const eventsResult = await pool.query(
      `SELECT name, date, start_time, end_time, venue_name, venue_address, dress_code, description
       FROM events
       WHERE wedding_id = $1
         AND date IS NOT NULL
         AND date >= (NOW() AT TIME ZONE $2)::date
         AND date <= ((NOW() AT TIME ZONE $2) + INTERVAL '7 days')::date
       ORDER BY date ASC, start_time ASC`,
      [session.weddingId, tz]
    );

    const reminders: { type: string; title: string; body: string; event_name?: string; when: string }[] = [];

    for (const event of eventsResult.rows) {
      const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
      const todayStr = `${nowInTz.getFullYear()}-${String(nowInTz.getMonth() + 1).padStart(2, '0')}-${String(nowInTz.getDate()).padStart(2, '0')}`;
      const isToday = event.date === todayStr || new Date(event.date).toISOString().slice(0, 10) === todayStr;
      const isTomorrow = (() => {
        const tomorrow = new Date(nowInTz);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
        return event.date === tomorrowStr || new Date(event.date).toISOString().slice(0, 10) === tomorrowStr;
      })();

      const timeStr = event.start_time ? (() => {
        const [h, m] = event.start_time.split(':');
        const hr = parseInt(h);
        return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
      })() : '';

      if (isToday) {
        reminders.push({
          type: 'today',
          title: `${event.name} is today!`,
          body: timeStr ? `Starts at ${timeStr}${event.venue_name ? ` at ${event.venue_name}` : ''}` : `At ${event.venue_name || 'the venue'}`,
          event_name: event.name,
          when: 'today',
        });
        if (event.dress_code) {
          reminders.push({
            type: 'dress_code',
            title: `What to wear to ${event.name}`,
            body: event.dress_code,
            event_name: event.name,
            when: 'today',
          });
        }
      } else if (isTomorrow) {
        reminders.push({
          type: 'tomorrow',
          title: `Tomorrow: ${event.name}`,
          body: timeStr ? `${timeStr}${event.venue_name ? ` at ${event.venue_name}` : ''}` : `At ${event.venue_name || 'the venue'}`,
          event_name: event.name,
          when: 'tomorrow',
        });
      }
    }

    return Response.json({ data: { reminders } });
  } catch (error) {
    return handleApiError(error);
  }
}
