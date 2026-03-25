'use client';

// Travel list: matches, ride shares, and guest destinations
import { useEffect, useState, useMemo } from 'react';

interface MapGuest {
  guest_id: string;
  display_name: string;
  arrive_date: string | null;
  depart_date: string | null;
  open_to_meetup: boolean;
  stop_type: string;
  visibility: string;
  notes: string | null;
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

interface RideShareMatch {
  display_name: string;
  time: string;
  transport_mode: string | null;
  transport_details: string | null;
  origin_city: string | null;
  share_contact: string | null;
}

interface RideShareGroup {
  type: 'arrival' | 'departure';
  your_date: string;
  your_time: string;
  city: string;
  matches: RideShareMatch[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${m} ${ampm}`;
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
  const [rideShares, setRideShares] = useState<RideShareGroup[]>([]);
  const [mySharing, setMySharing] = useState(false);
  const [loadingStops, setLoadingStops] = useState(true);
  const [loadingOverlaps, setLoadingOverlaps] = useState(true);
  const [loadingRides, setLoadingRides] = useState(true);
  const [citySearch, setCitySearch] = useState('');
  const [expandedGuest, setExpandedGuest] = useState<string | null>(null);

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
      setLoadingRides(false);
      return;
    }
    fetch(`/api/v1/w/${slug}/travel/overlaps`)
      .then((res) => res.json())
      .then((data) => setOverlaps(data.data?.overlaps || []))
      .catch(console.error)
      .finally(() => setLoadingOverlaps(false));

    fetch(`/api/v1/w/${slug}/travel/ride-shares`)
      .then((res) => res.json())
      .then((data) => {
        setRideShares(data.data?.ride_shares || []);
        setMySharing(data.data?.my_sharing || false);
      })
      .catch(console.error)
      .finally(() => setLoadingRides(false));
  }, [slug, hasPlan]);

  const loading = loadingStops || loadingOverlaps || loadingRides;

  // Build a map of guest_id → all their stops across cities
  const guestItineraries = useMemo(() => {
    const map = new Map<string, { display_name: string; stops: Array<{ city: string; country: string; arrive_date: string | null; depart_date: string | null; stop_type: string; notes: string | null }> }>();
    for (const stop of stops) {
      for (const guest of stop.guests) {
        if (!map.has(guest.guest_id)) {
          map.set(guest.guest_id, { display_name: guest.display_name, stops: [] });
        }
        map.get(guest.guest_id)!.stops.push({
          city: stop.city,
          country: stop.country,
          arrive_date: guest.arrive_date,
          depart_date: guest.depart_date,
          stop_type: guest.stop_type,
          notes: guest.notes,
        });
      }
    }
    return map;
  }, [stops]);

  // Filter stops by city search
  const filteredStops = useMemo(() => {
    if (!citySearch.trim()) return stops;
    const q = citySearch.toLowerCase();
    return stops.filter(
      (s) => s.city.toLowerCase().includes(q) || s.country.toLowerCase().includes(q)
    );
  }, [stops, citySearch]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-40 w-full rounded-2xl" />
        <div className="skeleton h-32 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Prompt to add plan — hero CTA card */}
      {hasPlan === false && (
        <button
          onClick={onAddPlan}
          className="w-full group overflow-hidden rounded-2xl flex flex-col relative transition-all duration-300 hover:shadow-lg text-left"
          style={{
            background: 'linear-gradient(145deg, rgba(198,163,85,0.08) 0%, rgba(196,112,75,0.06) 100%)',
            border: '1px solid rgba(198,163,85,0.15)',
          }}
        >
          <div className="p-6 flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
                boxShadow: '0 4px 12px rgba(198,163,85,0.3)',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FDFBF7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className="text-lg mb-1"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
              >
                Share Your Journey
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Add your travel plans to discover guests nearby and find ride shares
              </p>
              <div
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase"
                style={{ color: 'var(--color-gold-dark)' }}
              >
                Add My Plans
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        </button>
      )}

      {/* Your Matches section */}
      {hasPlan && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(198,163,85,0.1)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
            </div>
            <h2
              className="text-xl"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
            >
              Your Matches
            </h2>
          </div>

          {overlaps.length === 0 ? (
            <div
              className="rounded-2xl p-6 text-center"
              style={{
                background: 'var(--bg-pure-white)',
                border: '1px solid var(--border-light)',
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: 'rgba(198,163,85,0.08)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                No nearby matches yet. As more guests share plans, matches will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {overlaps.map((overlap) => (
                <div
                  key={`${overlap.city}|${overlap.country}`}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: 'var(--bg-pure-white)',
                    border: '1px solid var(--border-light)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <div
                    className="px-5 py-3 flex items-center justify-between"
                    style={{
                      background: 'linear-gradient(135deg, rgba(198,163,85,0.06), rgba(198,163,85,0.02))',
                      borderBottom: '1px solid var(--border-light)',
                    }}
                  >
                    <div>
                      <p
                        className="text-base font-medium"
                        style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                      >
                        {overlap.city}, {overlap.country}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        You: {formatDate(overlap.your_dates.arrive)} &ndash;{' '}
                        {formatDate(overlap.your_dates.depart)}
                      </p>
                    </div>
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{
                        background: 'linear-gradient(135deg, rgba(198,163,85,0.12), rgba(198,163,85,0.06))',
                        color: 'var(--color-gold-dark)',
                      }}
                    >
                      {overlap.overlapping_guests.length} {overlap.overlapping_guests.length === 1 ? 'match' : 'matches'}
                    </span>
                  </div>
                  <div className="p-3 space-y-2">
                    {overlap.overlapping_guests.map((guest, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 rounded-xl"
                        style={{ background: 'var(--bg-warm-white)' }}
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                          style={{
                            background: 'linear-gradient(145deg, var(--color-gold-dark), var(--color-gold))',
                            color: '#FDFBF7',
                            boxShadow: '0 2px 6px rgba(198,163,85,0.25)',
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
                              : `${guest.their_city} \u00b7 `}
                            {formatDate(guest.arrive_date)} &ndash;{' '}
                            {formatDate(guest.depart_date)}
                            {guest.distance_miles > 0 &&
                              ` \u00b7 ${guest.distance_miles}mi away`}
                          </p>
                        </div>
                        {guest.open_to_meetup && (
                          <span
                            className="text-[11px] font-medium px-2.5 py-1 rounded-full flex-shrink-0"
                            style={{
                              background: 'rgba(16,185,129,0.08)',
                              color: '#059669',
                            }}
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

      {/* Ride Shares section */}
      {hasPlan && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(196,112,75,0.08)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h2
              className="text-xl"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
            >
              Ride Shares
            </h2>
          </div>

          {!mySharing ? (
            <div
              className="rounded-2xl p-6 text-center"
              style={{
                background: 'var(--bg-pure-white)',
                border: '1px solid var(--border-light)',
              }}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: 'rgba(196,112,75,0.06)' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
                </svg>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Enable &ldquo;share a ride&rdquo; in My Plan to see guests
                arriving or departing near your time.
              </p>
            </div>
          ) : rideShares.length === 0 ? (
            <div
              className="rounded-2xl p-6 text-center"
              style={{
                background: 'var(--bg-pure-white)',
                border: '1px solid var(--border-light)',
              }}
            >
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                No ride matches yet. Make sure you&rsquo;ve added your arrival
                and departure times.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rideShares.map((group, gi) => (
                <div
                  key={gi}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: 'var(--bg-pure-white)',
                    border: '1px solid var(--border-light)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  <div
                    className="px-5 py-3 flex items-center gap-2"
                    style={{
                      background: group.type === 'arrival'
                        ? 'linear-gradient(135deg, rgba(198,163,85,0.06), rgba(198,163,85,0.02))'
                        : 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(16,185,129,0.02))',
                      borderBottom: '1px solid var(--border-light)',
                    }}
                  >
                    <span
                      className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{
                        background: group.type === 'arrival' ? 'rgba(198,163,85,0.12)' : 'rgba(16,185,129,0.12)',
                        color: group.type === 'arrival' ? 'var(--color-gold-dark)' : '#059669',
                      }}
                    >
                      {group.type === 'arrival' ? 'Arriving' : 'Departing'}
                    </span>
                    <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                      {group.city}
                    </p>
                    <p className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>
                      {formatDate(group.your_date)} at {formatTime(group.your_time)}
                    </p>
                  </div>
                  <div className="p-3 space-y-2">
                    {group.matches.map((match, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-xl"
                        style={{ background: 'var(--bg-warm-white)' }}
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                          style={{
                            background: 'linear-gradient(145deg, var(--color-gold-dark), var(--color-gold))',
                            color: '#FDFBF7',
                            boxShadow: '0 2px 6px rgba(198,163,85,0.25)',
                          }}
                        >
                          {match.display_name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {match.display_name}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {formatTime(match.time)}
                            {match.transport_mode && ` \u00b7 ${match.transport_mode}`}
                            {match.transport_details && ` ${match.transport_details}`}
                            {match.origin_city && ` \u00b7 from ${match.origin_city}`}
                          </p>
                          {match.share_contact && (
                            <p className="text-xs mt-1 font-medium" style={{ color: 'var(--color-gold-dark)' }}>
                              {match.share_contact}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Where Everyone Is Traveling */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(122,139,92,0.08)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-olive)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
            </svg>
          </div>
          <h2
            className="text-xl"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Guest Destinations
          </h2>
          {stops.length > 0 && (
            <span
              className="text-xs px-2.5 py-1 rounded-full ml-auto"
              style={{
                background: 'rgba(122,139,92,0.08)',
                color: 'var(--color-olive)',
                fontWeight: 500,
              }}
            >
              {new Set(stops.flatMap((s) => s.guests.map((g) => g.guest_id))).size} travelers
            </span>
          )}
        </div>

        {stops.length > 0 && (
          <div
            className="relative mb-4"
          >
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2"
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={citySearch}
              onChange={(e) => setCitySearch(e.target.value)}
              placeholder="Search by city or country..."
              className="w-full pl-10 pr-4 py-3 rounded-xl text-sm"
              style={{
                background: 'var(--bg-pure-white)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-primary)',
                outline: 'none',
                boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
              }}
            />
          </div>
        )}

        {stops.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              background: 'var(--bg-pure-white)',
              border: '1px solid var(--border-light)',
            }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: 'rgba(122,139,92,0.06)' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-olive)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
              </svg>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No travel plans shared yet. Be the first!
            </p>
          </div>
        ) : filteredStops.length === 0 ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{
              background: 'var(--bg-pure-white)',
              border: '1px solid var(--border-light)',
            }}
          >
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No cities match &ldquo;{citySearch}&rdquo;
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredStops.map((stop) => (
              <div
                key={`${stop.city}|${stop.country}`}
                className="rounded-2xl overflow-hidden"
                style={{
                  background: 'var(--bg-pure-white)',
                  border: '1px solid var(--border-light)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                }}
              >
                <div
                  className="px-5 py-3.5 flex items-center justify-between"
                  style={{
                    background: 'linear-gradient(135deg, rgba(122,139,92,0.05), rgba(122,139,92,0.01))',
                    borderBottom: '1px solid var(--border-light)',
                  }}
                >
                  <div>
                    <p
                      className="text-base font-medium"
                      style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                    >
                      {stop.city}, {stop.country}
                    </p>
                    {(() => {
                      const allOrigin = stop.guests.every((g) => g.stop_type === 'origin');
                      const someOrigin = stop.guests.some((g) => g.stop_type === 'origin');
                      if (allOrigin) {
                        return (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                            Departing from
                          </p>
                        );
                      }
                      if (someOrigin) {
                        return (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                            Departing &amp; visiting
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <span
                    className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{
                      background: 'rgba(122,139,92,0.08)',
                      color: 'var(--color-olive)',
                    }}
                  >
                    {stop.guest_count} {stop.guest_count === 1 ? 'guest' : 'guests'}
                  </span>
                </div>
                <div className="p-3 space-y-1">
                  {stop.guests.map((guest, i) => {
                    const isExpanded = expandedGuest === `${guest.guest_id}-${stop.city}`;
                    const itinerary = guestItineraries.get(guest.guest_id);

                    return (
                      <div key={`${guest.guest_id}-${i}`}>
                        <button
                          onClick={() =>
                            setExpandedGuest(
                              isExpanded ? null : `${guest.guest_id}-${stop.city}`
                            )
                          }
                          className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
                          style={{
                            background: isExpanded
                              ? 'linear-gradient(135deg, rgba(198,163,85,0.1), rgba(198,163,85,0.04))'
                              : 'var(--bg-warm-white)',
                          }}
                        >
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                            style={{
                              background: isExpanded
                                ? 'linear-gradient(145deg, var(--color-gold-dark), var(--color-gold))'
                                : 'linear-gradient(145deg, rgba(198,163,85,0.15), rgba(198,163,85,0.08))',
                              color: isExpanded ? '#FDFBF7' : 'var(--color-gold-dark)',
                              boxShadow: isExpanded ? '0 2px 6px rgba(198,163,85,0.25)' : 'none',
                            }}
                          >
                            {guest.display_name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {guest.display_name}
                            </p>
                            {!isExpanded && guest.arrive_date && (
                              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                                {formatDate(guest.arrive_date)}
                                {guest.depart_date ? ` \u2013 ${formatDate(guest.depart_date)}` : ''}
                              </p>
                            )}
                          </div>
                          <svg
                            width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            className="flex-shrink-0 transition-transform duration-200"
                            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>

                        {isExpanded && itinerary && (
                          <div
                            className="mt-1 mb-2 mx-3 p-4 rounded-xl text-xs space-y-3"
                            style={{
                              background: 'var(--bg-warm-white)',
                              border: '1px solid var(--border-light)',
                            }}
                          >
                            <p
                              className="font-medium text-sm"
                              style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                            >
                              {guest.display_name}&apos;s journey
                            </p>
                            <div className="relative pl-4">
                              <div
                                className="absolute left-[3px] top-2 bottom-2 w-px"
                                style={{ background: 'var(--border-light)' }}
                              />
                              {itinerary.stops.map((s, si) => (
                                <div
                                  key={si}
                                  className="flex items-start gap-3 pb-3 last:pb-0 relative"
                                >
                                  <div
                                    className="w-2 h-2 rounded-full mt-1 flex-shrink-0 -ml-[5px]"
                                    style={{
                                      background: s.city === stop.city
                                        ? 'var(--color-gold)'
                                        : 'var(--text-tertiary)',
                                      boxShadow: s.city === stop.city ? '0 0 0 3px rgba(198,163,85,0.15)' : 'none',
                                    }}
                                  />
                                  <div>
                                    <p style={{
                                      color: 'var(--text-primary)',
                                      fontWeight: s.city === stop.city ? 600 : 400,
                                    }}>
                                      {s.stop_type === 'origin' ? 'Departing from ' : ''}
                                      {s.city}, {s.country}
                                    </p>
                                    {s.arrive_date && (
                                      <p style={{ color: 'var(--text-secondary)' }}>
                                        {formatDate(s.arrive_date)}
                                        {s.depart_date ? ` \u2013 ${formatDate(s.depart_date)}` : ''}
                                      </p>
                                    )}
                                    {s.notes && (
                                      <p style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                                        {s.notes}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {guest.open_to_meetup && (
                              <p
                                className="font-medium"
                                style={{ color: '#059669' }}
                              >
                                Open to meetups
                              </p>
                            )}
                          </div>
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
    </div>
  );
}
