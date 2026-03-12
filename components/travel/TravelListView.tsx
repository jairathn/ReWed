'use client';

import { useEffect, useState } from 'react';

interface MapGuest {
  guest_id: string;
  display_name: string;
  arrive_date: string | null;
  depart_date: string | null;
  open_to_meetup: boolean;
  stop_type: string;
  visibility: string;
}

interface MapStop {
  city: string;
  country: string;
  guest_count: number;
  guests: MapGuest[];
}

interface OverlapGuest {
  display_name: string;
  their_city: string;
  their_country: string;
  arrive_date: string;
  depart_date: string;
  open_to_meetup: boolean;
  distance_miles: number;
}

interface CityOverlap {
  city: string;
  country: string;
  your_dates: { arrive: string; depart: string };
  overlapping_guests: OverlapGuest[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TravelListView({
  slug,
  hasPlan,
  onAddPlan,
}: {
  slug: string;
  hasPlan: boolean | null;
  onAddPlan: () => void;
}) {
  const [stops, setStops] = useState<MapStop[]>([]);
  const [overlaps, setOverlaps] = useState<CityOverlap[]>([]);
  const [loadingStops, setLoadingStops] = useState(true);
  const [loadingOverlaps, setLoadingOverlaps] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/w/${slug}/travel/map`)
      .then((res) => res.json())
      .then((data) => setStops(data.data?.stops || []))
      .catch(console.error)
      .finally(() => setLoadingStops(false));
  }, [slug]);

  useEffect(() => {
    if (!hasPlan) {
      setLoadingOverlaps(false);
      return;
    }
    fetch(`/api/v1/w/${slug}/travel/overlaps`)
      .then((res) => res.json())
      .then((data) => setOverlaps(data.data?.overlaps || []))
      .catch(console.error)
      .finally(() => setLoadingOverlaps(false));
  }, [slug, hasPlan]);

  const loading = loadingStops || loadingOverlaps;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-40 w-full rounded-2xl" />
        <div className="skeleton h-32 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Your Matches section */}
      {hasPlan && (
        <section>
          <h2
            className="text-base font-medium mb-3"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Your Matches
          </h2>

          {overlaps.length === 0 ? (
            <div
              className="card p-5 text-center"
              style={{ background: 'var(--bg-muted, #f9f8f6)' }}
            >
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                No nearby matches yet. As more guests share their plans, matches
                will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {overlaps.map((overlap) => (
                <div
                  key={`${overlap.city}|${overlap.country}`}
                  className="card p-4"
                  style={{ borderLeft: '3px solid #3b82f6' }}
                >
                  <p
                    className="text-sm font-medium mb-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {overlap.city}, {overlap.country}
                  </p>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                    You: {formatDate(overlap.your_dates.arrive)} &ndash;{' '}
                    {formatDate(overlap.your_dates.depart)}
                  </p>
                  <div className="space-y-2">
                    {overlap.overlapping_guests.map((guest, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-2.5 rounded-lg"
                        style={{ background: 'var(--bg-muted, #f9f8f6)' }}
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                          style={{
                            background: 'var(--color-terracotta)',
                            color: 'white',
                          }}
                        >
                          {guest.display_name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {guest.display_name}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {guest.their_city === overlap.city
                              ? ''
                              : `${guest.their_city} · `}
                            {formatDate(guest.arrive_date)} &ndash;{' '}
                            {formatDate(guest.depart_date)}
                            {guest.distance_miles > 0 &&
                              ` · ${guest.distance_miles}mi away`}
                          </p>
                        </div>
                        {guest.open_to_meetup && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: '#10b98120', color: '#10b981' }}
                          >
                            Meetup
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Prompt to add plan */}
      {hasPlan === false && (
        <div
          className="card p-5 text-center"
          style={{ borderLeft: '3px solid var(--color-terracotta)' }}
        >
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
            Share your travel plans to see who&rsquo;ll be nearby!
          </p>
          <button
            onClick={onAddPlan}
            className="px-5 py-2.5 rounded-full text-sm font-medium text-white"
            style={{ background: 'var(--color-terracotta-gradient)' }}
          >
            Add My Travel Plans
          </button>
        </div>
      )}

      {/* Where Everyone Is Traveling */}
      <section>
        <h2
          className="text-base font-medium mb-3"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
        >
          Where Everyone Is Traveling
        </h2>

        {stops.length === 0 ? (
          <div
            className="card p-5 text-center"
            style={{ background: 'var(--bg-muted, #f9f8f6)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No travel plans shared yet. Be the first!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {stops.map((stop) => (
              <div
                key={`${stop.city}|${stop.country}`}
                className="card p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <p
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {stop.city}, {stop.country}
                  </p>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--bg-muted, #f5f3f0)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {stop.guest_count} {stop.guest_count === 1 ? 'guest' : 'guests'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {stop.guests.map((guest, i) => (
                    <div
                      key={`${guest.guest_id}-${i}`}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
                      style={{ background: 'var(--bg-muted, #f9f8f6)' }}
                    >
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
                        style={{
                          background: 'var(--color-terracotta)',
                          color: 'white',
                        }}
                      >
                        {guest.display_name.charAt(0)}
                      </div>
                      <span style={{ color: 'var(--text-primary)' }}>
                        {guest.display_name}
                      </span>
                      {guest.arrive_date && (
                        <span style={{ color: 'var(--text-tertiary)' }}>
                          {formatDate(guest.arrive_date)}
                          {guest.depart_date ? `–${formatDate(guest.depart_date)}` : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
