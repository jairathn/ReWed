'use client';

import { useEffect, useState } from 'react';

interface MapGuest {
  guest_id: string;
  display_name: string;
  arrive_date: string | null;
  depart_date: string | null;
  open_to_meetup: boolean;
  notes: string | null;
  stop_type: string;
  visibility: string;
}

interface MapStop {
  city: string;
  country: string;
  country_code: string | null;
  latitude: number;
  longitude: number;
  guest_count: number;
  guests: MapGuest[];
}

export default function TravelMapView({ slug }: { slug: string }) {
  const [stops, setStops] = useState<MapStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState<MapStop | null>(null);

  useEffect(() => {
    fetch(`/api/v1/w/${slug}/travel/map`)
      .then((res) => res.json())
      .then((data) => setStops(data.data?.stops || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="skeleton h-64 w-full rounded-2xl" />;
  }

  if (stops.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-3xl mb-3">&#127758;</p>
        <p style={{ color: 'var(--text-secondary)' }}>
          No travel plans shared yet. Be the first!
        </p>
      </div>
    );
  }

  const stopTypeColor: Record<string, string> = {
    origin: '#d97706',
    pre_wedding: '#3b82f6',
    post_wedding: '#10b981',
    return: '#d97706',
  };

  return (
    <div>
      {/* City pins grid (CSS-based map alternative for V1) */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">&#127758;</span>
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {stops.length} {stops.length === 1 ? 'city' : 'cities'} &middot;{' '}
            {stops.reduce((sum, s) => sum + s.guest_count, 0)} guest pins
          </span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#d97706' }} />Origin</span>
          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#3b82f6' }} />Pre-wedding</span>
          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#10b981' }} />Post-wedding</span>
        </div>

        {/* City list */}
        <div className="space-y-2">
          {stops.map((stop) => {
            const dominantType = stop.guests[0]?.stop_type || 'origin';
            const color = stopTypeColor[dominantType] || '#6b7280';

            return (
              <button
                key={`${stop.city}|${stop.country}`}
                onClick={() => setSelectedCity(selectedCity?.city === stop.city ? null : stop)}
                className="w-full text-left p-3 rounded-xl transition-colors"
                style={{
                  background: selectedCity?.city === stop.city ? `${color}10` : 'var(--bg-muted, #f9f8f6)',
                  borderLeft: `3px solid ${color}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                      {stop.city}, {stop.country}
                    </span>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: `${color}20`, color }}
                  >
                    {stop.guest_count} {stop.guest_count === 1 ? 'guest' : 'guests'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Expanded city detail */}
      {selectedCity && (
        <div className="card p-4 mb-4" style={{ borderTop: '3px solid var(--color-terracotta)' }}>
          <h3
            className="font-medium mb-3"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            {selectedCity.city}, {selectedCity.country}
          </h3>

          <div className="space-y-3">
            {selectedCity.guests.map((guest) => (
              <div
                key={guest.guest_id + guest.stop_type}
                className="flex items-start gap-3 p-3 rounded-lg"
                style={{ background: 'var(--bg-muted, #f9f8f6)' }}
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
                  {guest.arrive_date && (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {guest.arrive_date}{guest.depart_date ? ` \u2013 ${guest.depart_date}` : ''}
                    </p>
                  )}
                  {guest.visibility === 'city_only' && (
                    <p className="text-xs italic" style={{ color: 'var(--text-tertiary)' }}>
                      (cities only)
                    </p>
                  )}
                  {guest.open_to_meetup && (
                    <p className="text-xs mt-1" style={{ color: '#10b981' }}>
                      &#129309; Open to meetup
                    </p>
                  )}
                  {guest.notes && (
                    <p className="text-xs mt-1 italic" style={{ color: 'var(--text-tertiary)' }}>
                      &ldquo;{guest.notes}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Date overlap callout */}
          {(() => {
            const guestsWithDates = selectedCity.guests.filter(
              (g) => g.arrive_date && g.depart_date
            );
            if (guestsWithDates.length < 2) return null;

            // Find overlap window
            const maxArrive = guestsWithDates.reduce(
              (max, g) => (g.arrive_date! > max ? g.arrive_date! : max),
              guestsWithDates[0].arrive_date!
            );
            const minDepart = guestsWithDates.reduce(
              (min, g) => (g.depart_date! < min ? g.depart_date! : min),
              guestsWithDates[0].depart_date!
            );

            if (maxArrive >= minDepart) return null;

            return (
              <div
                className="mt-3 p-3 rounded-lg text-sm"
                style={{ background: '#3b82f610', color: '#3b82f6' }}
              >
                &#128197; Date overlap: {guestsWithDates.length} guests overlap {maxArrive} &ndash; {minDepart}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
