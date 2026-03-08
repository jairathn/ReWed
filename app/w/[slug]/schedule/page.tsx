import { getPool } from '@/lib/db/client';
import BottomNav from '@/components/guest/BottomNav';

type Params = { slug: string };

async function getScheduleData(slug: string) {
  const pool = getPool();

  const weddingResult = await pool.query(
    'SELECT id, display_name, config FROM weddings WHERE slug = $1',
    [slug]
  );

  if (weddingResult.rows.length === 0) return null;

  const wedding = weddingResult.rows[0];

  const eventsResult = await pool.query(
    `SELECT id, name, date, start_time, end_time, venue_name, venue_address,
            dress_code, description, logistics, accent_color
     FROM events WHERE wedding_id = $1
     ORDER BY sort_order ASC, date ASC, start_time ASC`,
    [wedding.id]
  );

  return {
    wedding,
    events: eventsResult.rows,
  };
}

function formatTime(time: string | null): string {
  if (!time) return '';
  try {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  } catch {
    return time;
  }
}

function formatDate(date: string | null): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// Event color map for emojis
const eventEmojis: Record<string, string> = {
  haldi: '\u{1F33B}',
  sangeet: '\u{1F3A4}',
  wedding: '\u{1F48D}',
  reception: '\u{1F37E}',
  mehndi: '\u{270B}',
  ceremony: '\u{1F492}',
};

function getEventEmoji(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(eventEmojis)) {
    if (lower.includes(key)) return emoji;
  }
  return '\u{2728}';
}

export default async function SchedulePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const data = await getScheduleData(slug);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p style={{ color: 'var(--text-secondary)' }}>Wedding not found</p>
      </div>
    );
  }

  const { events } = data;

  return (
    <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
      <h1
        className="text-2xl font-medium mb-6"
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)',
        }}
      >
        Schedule
      </h1>

      {/* Timeline */}
      <div className="relative">
        {/* Gradient line */}
        <div
          className="absolute left-[18px] top-4 bottom-4 w-0.5"
          style={{
            background:
              'linear-gradient(180deg, var(--color-terracotta) 0%, var(--color-golden) 50%, var(--color-olive) 100%)',
          }}
        />

        <div className="space-y-4">
          {events.map(
            (
              event: {
                id: string;
                name: string;
                date: string | null;
                start_time: string | null;
                end_time: string | null;
                venue_name: string | null;
                venue_address: string | null;
                dress_code: string | null;
                description: string | null;
                logistics: string | null;
                accent_color: string | null;
              },
              index: number
            ) => {
              const isFirst = index === 0;
              const accentColor =
                event.accent_color || 'var(--color-terracotta)';

              return (
                <div key={event.id} className="relative flex gap-4">
                  {/* Timeline dot */}
                  <div className="flex-shrink-0 w-9 flex justify-center pt-5">
                    <div
                      className="w-3 h-3 rounded-full z-10"
                      style={{
                        background: accentColor,
                        boxShadow: isFirst
                          ? `0 0 0 4px ${accentColor}30`
                          : 'none',
                      }}
                    />
                  </div>

                  {/* Event card */}
                  <div
                    className="flex-1 card p-5"
                    style={{
                      borderLeft: `3px solid ${accentColor}`,
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p
                          className="text-lg font-medium"
                          style={{
                            fontFamily: 'var(--font-display)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {getEventEmoji(event.name)} {event.name}
                        </p>
                        {event.date && (
                          <p
                            className="text-sm"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            {formatDate(event.date)}
                          </p>
                        )}
                      </div>
                    </div>

                    {(event.start_time || event.end_time) && (
                      <p
                        className="text-sm mb-2"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {formatTime(event.start_time)}
                        {event.end_time && ` \u2013 ${formatTime(event.end_time)}`}
                      </p>
                    )}

                    {event.venue_name && (
                      <p
                        className="text-sm mb-1"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {event.venue_name}
                      </p>
                    )}

                    {event.venue_address && (
                      <p
                        className="text-xs mb-2"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {event.venue_address}
                      </p>
                    )}

                    {event.dress_code && (
                      <div
                        className="inline-block px-3 py-1 rounded-full text-xs font-medium mb-2"
                        style={{
                          background: `${accentColor}15`,
                          color: accentColor,
                        }}
                      >
                        {event.dress_code}
                      </div>
                    )}

                    {event.description && (
                      <p
                        className="text-sm mt-2"
                        style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}
                      >
                        {event.description}
                      </p>
                    )}

                    {event.logistics && (
                      <p
                        className="text-xs mt-2 italic"
                        style={{ color: 'var(--text-tertiary)', whiteSpace: 'pre-line' }}
                      >
                        {event.logistics}
                      </p>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>

        {events.length === 0 && (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">&#128197;</p>
            <p style={{ color: 'var(--text-secondary)' }}>
              The schedule will be posted soon!
            </p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
