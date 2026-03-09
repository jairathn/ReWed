'use client';

import { useEffect, useState } from 'react';

interface ArrivalInfo {
  guest_id: string;
  display_name: string;
  stop_type: string;
  arrive_date: string | null;
  depart_date: string | null;
  arrive_time: string | null;
  transport_mode: string | null;
  transport_details: string | null;
  share_transport: boolean;
  origin_city: string | null;
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
        <div className="skeleton h-16 w-full rounded-xl" />
        <div className="skeleton h-16 w-full rounded-xl" />
      </div>
    );
  }

  const arrivingGuests = arrivals.filter((a) => a.stop_type === 'arrival');
  const departingGuests = arrivals.filter((a) => a.stop_type === 'departure');

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
      <div className="card p-8 text-center">
        <p className="text-3xl mb-3">&#9992;&#65039;</p>
        <p style={{ color: 'var(--text-secondary)' }}>
          No arrival info shared yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Arrivals */}
      <div>
        <h3
          className="text-lg font-medium mb-3"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
        >
          Arrivals
        </h3>
        {groupByDate(arrivingGuests, 'arrive_date').map(([date, guests]) => (
          <div key={date} className="mb-4">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>
              {date !== 'Unknown' ? formatDateLabel(date) : 'Date TBD'}
            </p>
            <div className="space-y-2">
              {guests.map((guest) => (
                <div
                  key={guest.guest_id}
                  className="card p-3 flex items-center gap-3"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                    style={{ background: 'var(--color-terracotta)', color: 'white' }}
                  >
                    {guest.display_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {guest.display_name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {guest.arrive_time || ''}{' '}
                      {guest.transport_mode && transportIcon[guest.transport_mode]}{' '}
                      {guest.transport_details || ''}
                      {guest.origin_city ? ` from ${guest.origin_city}` : ''}
                    </p>
                  </div>
                  {guest.share_transport && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: '#10b98120', color: '#10b981' }}
                    >
                      &#128663; Sharing ride
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {arrivingGuests.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No arrivals shared yet</p>
        )}
      </div>

      {/* Departures */}
      <div>
        <h3
          className="text-lg font-medium mb-3"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
        >
          Departures
        </h3>
        {groupByDate(departingGuests, 'depart_date').map(([date, guests]) => (
          <div key={date} className="mb-4">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>
              {date !== 'Unknown' ? formatDateLabel(date) : 'Date TBD'}
            </p>
            <div className="space-y-2">
              {guests.map((guest) => (
                <div
                  key={guest.guest_id}
                  className="card p-3 flex items-center gap-3"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                    style={{ background: 'var(--color-olive, #6b7280)', color: 'white' }}
                  >
                    {guest.display_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {guest.display_name}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {guest.arrive_time || ''}{' '}
                      {guest.transport_mode && transportIcon[guest.transport_mode]}{' '}
                      {guest.transport_details || ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {departingGuests.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No departures shared yet</p>
        )}
      </div>
    </div>
  );
}
