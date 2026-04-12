import { getPool } from '@/lib/db/client';
import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';

type Params = { slug: string };

interface EventRow {
  id: string;
  name: string;
  date: unknown;
  start_time: string | null;
  end_time: string | null;
  end_date: unknown;
  venue_name: string | null;
  venue_address: string | null;
  dress_code: string | null;
  description: string | null;
  logistics: string | null;
  accent_color: string | null;
}

async function getScheduleData(slug: string) {
  const pool = getPool();

  const weddingResult = await pool.query(
    'SELECT id, display_name, config, timezone, venue_city, venue_country FROM weddings WHERE slug = $1',
    [slug]
  );

  if (weddingResult.rows.length === 0) return null;

  const wedding = weddingResult.rows[0];

  const eventsResult = await pool.query(
    `SELECT id, name, date, start_time, end_time, end_date, venue_name, venue_address,
            dress_code, description, logistics, accent_color
     FROM events WHERE wedding_id = $1
     ORDER BY sort_order ASC, date ASC, start_time ASC`,
    [wedding.id]
  );

  return {
    wedding,
    events: eventsResult.rows as EventRow[],
    timezone: wedding.timezone || 'America/New_York',
    venueCity: wedding.venue_city || null,
    venueCountry: wedding.venue_country || null,
  };
}

function normalizeDate(date: unknown): string | null {
  if (!date) return null;
  if (date instanceof Date) return date.toISOString().slice(0, 10);
  const s = String(date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.includes('T')) return s.slice(0, 10);
  return s;
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

function formatDayHeader(date: unknown, tz: string): string {
  const ds = normalizeDate(date);
  if (!ds) return '';
  const d = new Date(ds + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  });
}

function formatShortDate(date: unknown, tz: string): string {
  const ds = normalizeDate(date);
  if (!ds) return '';
  const d = new Date(ds + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  });
}

function isDatePast(date: unknown): boolean {
  const ds = normalizeDate(date);
  if (!ds) return false;
  const eventDate = new Date(ds + 'T23:59:59');
  return eventDate < new Date();
}

function getTimezoneAbbr(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}

/** Group events by their date string */
function groupByDate(events: EventRow[]): { dateKey: string; date: unknown; events: EventRow[] }[] {
  const groups: Map<string, { date: unknown; events: EventRow[] }> = new Map();
  for (const ev of events) {
    const key = normalizeDate(ev.date) || 'no-date';
    if (!groups.has(key)) {
      groups.set(key, { date: ev.date, events: [] });
    }
    groups.get(key)!.events.push(ev);
  }
  return Array.from(groups.entries()).map(([dateKey, { date, events }]) => ({
    dateKey,
    date,
    events,
  }));
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

  const { events, timezone, venueCity, venueCountry } = data;
  const tzAbbr = getTimezoneAbbr(timezone);
  const dayGroups = groupByDate(events);

  // Compute date range for subtitle
  const allDates = events.map((e) => normalizeDate(e.date)).filter(Boolean) as string[];
  const sortedDates = [...new Set(allDates)].sort();
  let dateRangeStr = '';
  if (sortedDates.length > 0) {
    const first = formatShortDate(sortedDates[0], timezone);
    if (sortedDates.length === 1) {
      dateRangeStr = first + ', ' + new Date(sortedDates[0] + 'T12:00:00').getFullYear();
    } else {
      const last = sortedDates[sortedDates.length - 1];
      const lastDay = new Date(last + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', timeZone: timezone });
      const year = new Date(last + 'T12:00:00').getFullYear();
      dateRangeStr = `${first} – ${lastDay}, ${year}`;
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-warm-white)' }}>
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
        style={{
          background: 'rgba(250, 249, 245, 0.90)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div className="flex items-center gap-3">
          <BackButton href={`/w/${slug}/home`} label="" />
        </div>
        <h1
          className="text-2xl tracking-wide"
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            color: 'var(--color-gold-dark)',
          }}
        >
          ReWed
        </h1>
        <div className="w-8" />
      </header>

      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1">
        <section className="mb-10 text-center">
          <h2
            className="text-5xl mb-3 tracking-tight"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            Schedule
          </h2>
          <div className="flex items-center justify-center gap-3">
            <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
            <p
              className="text-lg"
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                color: 'var(--color-terracotta)',
              }}
            >
              {venueCity ? `${venueCity}${venueCountry ? `, ${venueCountry}` : ''}` : dateRangeStr || 'Your weekend itinerary'}
            </p>
            <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
          </div>
        </section>

        {/* Timeline */}
      {events.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-4">&#128197;</p>
          <p style={{ color: 'var(--text-secondary)' }}>
            The schedule will be posted soon!
          </p>
        </div>
      ) : (
        <div className="relative" style={{ paddingLeft: 24 }}>
          {/* Vertical timeline line */}
          <div
            className="absolute top-0 bottom-0"
            style={{
              left: 4.5,
              width: 1,
              background: 'linear-gradient(180deg, var(--color-terracotta), var(--color-golden) 50%, var(--color-terracotta))',
              opacity: 0.3,
            }}
          />

          {dayGroups.map((group) => {
            const past = isDatePast(group.date);

            return (
              <div key={group.dateKey} style={{ marginBottom: 40 }}>
                {/* Day header with timeline dot */}
                <div className="relative" style={{ marginLeft: -24, paddingLeft: 24, marginBottom: 18 }}>
                  {/* Timeline dot */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 10,
                      height: 10,
                      ...(past
                        ? {
                            background: 'linear-gradient(145deg, var(--color-terracotta), var(--color-golden))',
                            boxShadow: '0 0 8px rgba(196, 112, 75, 0.3)',
                          }
                        : {
                            border: '1.5px solid var(--color-golden)',
                            background: 'var(--bg-soft-cream)',
                          }),
                    }}
                  />
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--color-golden)',
                      fontFamily: 'var(--font-body)',
                      margin: 0,
                    }}
                  >
                    {formatDayHeader(group.date, timezone)}
                  </p>
                </div>

                {/* Events for this day */}
                {group.events.map((event, ei) => (
                  <div
                    key={event.id}
                    style={{
                      marginBottom: 20,
                      paddingBottom: ei < group.events.length - 1 ? 20 : 0,
                      borderBottom: ei < group.events.length - 1 ? '0.5px solid var(--border-light)' : 'none',
                    }}
                  >
                    {/* Event name */}
                    <p
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 22,
                        fontWeight: 400,
                        color: 'var(--text-primary)',
                        lineHeight: 1.2,
                        margin: 0,
                      }}
                    >
                      {event.name}
                    </p>

                    {/* Description with preserved line formatting */}
                    {event.description && (
                      <p
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 14,
                          fontStyle: 'italic',
                          color: 'var(--text-secondary)',
                          marginTop: 3,
                          whiteSpace: 'pre-line',
                          lineHeight: 1.6,
                        }}
                      >
                        {event.description}
                      </p>
                    )}

                    {/* Time */}
                    {(event.start_time || event.end_time) && (
                      <p
                        style={{
                          fontSize: 13,
                          color: 'var(--color-terracotta)',
                          fontWeight: 500,
                          marginTop: 12,
                          marginBottom: 14,
                        }}
                      >
                        {formatTime(event.start_time)}
                        {event.end_time && ` \u2013 ${formatTime(event.end_time)}`}
                        {tzAbbr && ` ${tzAbbr}`}
                      </p>
                    )}

                    {/* Venue — links to Google Maps */}
                    {event.venue_name && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue_name + (event.venue_address ? ', ' + event.venue_address : ''))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-1.5 mb-0.5 group"
                        style={{ textDecoration: 'none' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-golden)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                        </svg>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }} className="group-hover:underline">
                          {event.venue_name}
                        </span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-golden)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0 opacity-60">
                          <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                        </svg>
                      </a>
                    )}
                    {/* Uber link */}
                    {event.venue_address && (
                      <a
                        href={`https://m.uber.com/ul/?action=setPickup&dropoff[formatted_address]=${encodeURIComponent(event.venue_name + ', ' + event.venue_address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 mt-2 ml-[18px] group"
                        style={{ textDecoration: 'none' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M8 12h4v5" />
                          <path d="M12 7v5" />
                        </svg>
                        <span className="text-xs group-hover:underline" style={{ color: 'var(--text-tertiary)' }}>
                          Get a ride
                        </span>
                      </a>
                    )}
                    {event.logistics && (
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 18, marginTop: 2 }}>
                        {event.logistics}
                      </p>
                    )}

                    {/* What to Wear card */}
                    {event.dress_code && (
                      <div
                        className="relative"
                        style={{
                          marginTop: 20,
                          padding: '18px 20px',
                          background: 'var(--bg-soft-cream)',
                          borderRadius: 12,
                          border: '0.5px solid rgba(196, 112, 75, 0.12)',
                        }}
                      >
                        {/* Corner ornaments */}
                        <div style={{ position: 'absolute', top: 8, left: 8, width: 12, height: 1, background: 'rgba(196, 112, 75, 0.25)' }} />
                        <div style={{ position: 'absolute', top: 8, left: 8, width: 1, height: 12, background: 'rgba(196, 112, 75, 0.25)' }} />
                        <div style={{ position: 'absolute', bottom: 8, right: 8, width: 12, height: 1, background: 'rgba(196, 112, 75, 0.25)' }} />
                        <div style={{ position: 'absolute', bottom: 8, right: 8, width: 1, height: 12, background: 'rgba(196, 112, 75, 0.25)' }} />

                        <p
                          style={{
                            fontSize: 10,
                            fontWeight: 500,
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            color: 'var(--color-golden)',
                            marginBottom: 10,
                          }}
                        >
                          What to Wear
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                          {event.dress_code}
                        </p>

                        {/* Venue address — clickable to Google Maps */}
                        {event.venue_address && (
                          <>
                            <div
                              style={{
                                height: 1,
                                margin: '14px 0',
                                background: 'linear-gradient(90deg, transparent, var(--color-golden) 30%, var(--color-golden) 70%, transparent)',
                                opacity: 0.2,
                              }}
                            />
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((event.venue_name || '') + ', ' + event.venue_address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 hover:underline"
                              style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, textDecoration: 'none' }}
                            >
                              <span>{event.venue_address}</span>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-golden)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-60">
                                <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
                              </svg>
                            </a>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      </main>

      <BottomNav />
    </div>
  );
}
