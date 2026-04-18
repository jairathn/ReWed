'use client';

import { useEffect, useState } from 'react';

interface Companion {
  id: string;
  display_name: string;
}

interface ArrivalInfo {
  guest_id: string;
  display_name: string;
  stop_type: string;
  arrive_date: string | null;
  depart_date: string | null;
  arrive_time: string | null;
  depart_time: string | null;
  transport_mode: string | null;
  transport_details: string | null;
  share_transport: boolean;
  origin_city: string | null;
  traveling_with: Companion[];
}

const transportIcon: Record<string, string> = {
  flight: '\u2708\uFE0F',
  train: '\uD83D\uDE82',
  car: '\uD83D\uDE97',
  bus: '\uD83D\uDE8C',
  ferry: '\u26F4\uFE0F',
};

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${m} ${ampm}`;
}

export default function ArrivalsView({ slug }: { slug: string }) {
  const [arrivals, setArrivals] = useState<ArrivalInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/w/${slug}/travel/arrivals`)
      .then((res) => res.json())
      .then((data) => setArrivals(data.data?.arrivals || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-16 w-full rounded-2xl" />
        <div className="skeleton h-16 w-full rounded-2xl" />
      </div>
    );
  }

  // Dedup by travel group: if a guest and their companions all appear with the same
  // stop_type + date, only render one card for the group.
  function dedupByGroup(list: ArrivalInfo[], dateField: 'arrive_date' | 'depart_date') {
    const seen = new Set<string>();
    const result: ArrivalInfo[] = [];
    for (const a of list) {
      const groupIds = [a.guest_id, ...a.traveling_with.map((c) => c.id)].sort();
      const key = `${a.stop_type}|${a[dateField] || ''}|${groupIds.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(a);
    }
    return result;
  }

  const arrivingGuests = dedupByGroup(
    arrivals.filter((a) => a.stop_type === 'arrival'),
    'arrive_date'
  );
  const departingGuests = dedupByGroup(
    arrivals.filter((a) => a.stop_type === 'departure'),
    'depart_date'
  );

  // Group by date
  function groupByDate(list: ArrivalInfo[], dateField: 'arrive_date' | 'depart_date') {
    const groups = new Map<string, ArrivalInfo[]>();
    for (const item of list) {
      const date = item[dateField] || 'Unknown';
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date)!.push(item);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }

  if (arrivals.length === 0) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{
          background: 'var(--bg-pure-white)',
          border: '1px solid var(--border-light)',
        }}
      >
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ background: 'rgba(196,112,75,0.06)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
            <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
          </svg>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          No arrival info shared yet
        </p>
      </div>
    );
  }

  function renderSection(
    title: string,
    icon: string,
    iconColor: string,
    bgTint: string,
    guests: ArrivalInfo[],
    dateField: 'arrive_date' | 'depart_date',
    emptyText: string,
    avatarBg: string,
  ) {
    return (
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: bgTint }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={icon} />
            </svg>
          </div>
          <h3
            className="text-xl"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            {title}
          </h3>
          {guests.length > 0 && (
            <span
              className="text-xs px-2.5 py-1 rounded-full ml-auto font-medium"
              style={{ background: bgTint, color: iconColor }}
            >
              {guests.length}
            </span>
          )}
        </div>

        {guests.length === 0 ? (
          <p className="text-sm pl-11" style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
            {emptyText}
          </p>
        ) : (
          <div className="space-y-4">
            {groupByDate(guests, dateField).map(([date, dateGuests]) => (
              <div key={date}>
                <p
                  className="text-xs font-semibold uppercase tracking-wider mb-2 pl-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {date !== 'Unknown' ? formatDateLabel(date) : 'Date TBD'}
                </p>
                <div className="space-y-2">
                  {dateGuests.map((guest) => {
                    const hasCompanions = guest.traveling_with && guest.traveling_with.length > 0;
                    return (
                      <div
                        key={guest.guest_id}
                        className="flex items-center gap-3 p-3.5 rounded-2xl relative"
                        style={{
                          background: hasCompanions
                            ? 'linear-gradient(135deg, rgba(198,163,85,0.06) 0%, var(--bg-pure-white) 60%)'
                            : 'var(--bg-pure-white)',
                          border: hasCompanions
                            ? '1px solid rgba(198,163,85,0.25)'
                            : '1px solid var(--border-light)',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                        }}
                      >
                        {hasCompanions ? (
                          <div className="relative flex-shrink-0" style={{ width: 44, height: 40 }}>
                            <div
                              className="absolute w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold"
                              style={{
                                top: 0,
                                left: 0,
                                background: avatarBg,
                                color: '#FDFBF7',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                                zIndex: 2,
                              }}
                            >
                              {guest.display_name.charAt(0)}
                            </div>
                            <div
                              className="absolute w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                              style={{
                                bottom: -2,
                                right: -2,
                                background: 'linear-gradient(145deg, var(--color-gold-dark), var(--color-gold))',
                                color: '#FDFBF7',
                                border: '2px solid var(--bg-pure-white)',
                                zIndex: 1,
                              }}
                            >
                              {guest.traveling_with[0].display_name.charAt(0)}
                            </div>
                          </div>
                        ) : (
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                            style={{
                              background: avatarBg,
                              color: '#FDFBF7',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                            }}
                          >
                            {guest.display_name.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {guest.display_name}
                            {hasCompanions && (
                              <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>
                                {' '}&amp;{' '}
                                {guest.traveling_with.map((c) => c.display_name.split(' ')[0]).join(' & ')}
                              </span>
                            )}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {dateField === 'arrive_date' && guest.arrive_time ? formatTime(guest.arrive_time) : ''}
                            {dateField === 'depart_date' && guest.depart_time ? formatTime(guest.depart_time) : ''}
                            {guest.transport_mode && ` ${transportIcon[guest.transport_mode]}`}
                            {guest.transport_details && ` ${guest.transport_details}`}
                            {guest.origin_city ? ` from ${guest.origin_city}` : ''}
                          </p>
                        </div>
                        {guest.share_transport && (
                          <span
                            className="text-[11px] font-medium px-2.5 py-1 rounded-full flex-shrink-0"
                            style={{
                              background: 'rgba(198,163,85,0.1)',
                              color: 'var(--color-gold-dark)',
                            }}
                          >
                            Sharing
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {renderSection(
        'Arrivals',
        'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z',
        'var(--color-terracotta)',
        'rgba(196,112,75,0.08)',
        arrivingGuests,
        'arrive_date',
        'No arrivals shared yet',
        'linear-gradient(145deg, var(--color-terracotta), #d4896a)',
      )}

      {renderSection(
        'Departures',
        'M22 12h-4l-3 9L9 3l-3 9H2',
        'var(--color-olive)',
        'rgba(122,139,92,0.08)',
        departingGuests,
        'depart_date',
        'No departures shared yet',
        'linear-gradient(145deg, var(--color-olive), #8fa069)',
      )}
    </div>
  );
}
