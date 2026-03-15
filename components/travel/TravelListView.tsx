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
                              : `${guest.their_city} \u00b7 `}
                            {formatDate(guest.arrive_date)} &ndash;{' '}
                            {formatDate(guest.depart_date)}
                            {guest.distance_miles > 0 &&
                              ` \u00b7 ${guest.distance_miles}mi away`}
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

      {/* Ride Shares section */}
      {hasPlan && (
        <section>
          <h2
            className="text-base font-medium mb-3"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Ride Shares
          </h2>

          {!mySharing ? (
            <div
              className="card p-5 text-center"
              style={{ background: 'var(--bg-muted, #f9f8f6)' }}
            >
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Enable &ldquo;share a ride&rdquo; in My Plan to see guests
                arriving or departing within 2 hours of you.
              </p>
            </div>
          ) : rideShares.length === 0 ? (
            <div
              className="card p-5 text-center"
              style={{ background: 'var(--bg-muted, #f9f8f6)' }}
            >
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                No ride matches yet. Make sure you&rsquo;ve added your arrival
                and departure times.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {rideShares.map((group, gi) => (
                <div
                  key={gi}
                  className="card p-4"
                  style={{ borderLeft: '3px solid #d97706' }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: group.type === 'arrival' ? '#3b82f620' : '#10b98120',
                        color: group.type === 'arrival' ? '#3b82f6' : '#10b981',
                      }}
                    >
                      {group.type === 'arrival' ? 'Arriving' : 'Departing'}
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {group.city}
                    </span>
                  </div>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                    You: {formatDate(group.your_date)} at {formatTime(group.your_time)}
                  </p>
                  <div className="space-y-2">
                    {group.matches.map((match, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-2.5 rounded-lg"
                        style={{ background: 'var(--bg-muted, #f9f8f6)' }}
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                          style={{
                            background: '#d97706',
                            color: 'white',
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
                            <p className="text-xs mt-1 font-medium" style={{ color: '#d97706' }}>
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

        {stops.length > 0 && (
          <input
            type="text"
            value={citySearch}
            onChange={(e) => setCitySearch(e.target.value)}
            placeholder="Search by city or country..."
            className="w-full px-3 py-2 rounded-lg text-sm mb-3"
            style={{
              background: 'var(--bg-muted, #f9f8f6)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        )}

        {stops.length === 0 ? (
          <div
            className="card p-5 text-center"
            style={{ background: 'var(--bg-muted, #f9f8f6)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No travel plans shared yet. Be the first!
            </p>
          </div>
        ) : filteredStops.length === 0 ? (
          <div
            className="card p-5 text-center"
            style={{ background: 'var(--bg-muted, #f9f8f6)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No cities match &ldquo;{citySearch}&rdquo;
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredStops.map((stop) => (
              <div
                key={`${stop.city}|${stop.country}`}
                className="card p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {stop.city}, {stop.country}
                    </p>
                    {/* Show context label based on stop types */}
                    {(() => {
                      const allOrigin = stop.guests.every((g) => g.stop_type === 'origin');
                      const someOrigin = stop.guests.some((g) => g.stop_type === 'origin');
                      if (allOrigin) {
                        return (
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Departing from
                          </p>
                        );
                      }
                      if (someOrigin) {
                        return (
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Departing &amp; visiting
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
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
                  {stop.guests.map((guest, i) => {
                    const isExpanded = expandedGuest === `${guest.guest_id}-${stop.city}`;
                    const itinerary = guestItineraries.get(guest.guest_id);

                    return (
                      <div key={`${guest.guest_id}-${i}`} className="w-full">
                        <button
                          onClick={() =>
                            setExpandedGuest(
                              isExpanded ? null : `${guest.guest_id}-${stop.city}`
                            )
                          }
                          className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs text-left"
                          style={{
                            background: isExpanded
                              ? 'var(--color-terracotta)'
                              : 'var(--bg-muted, #f9f8f6)',
                          }}
                        >
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0"
                            style={{
                              background: isExpanded ? 'rgba(255,255,255,0.3)' : 'var(--color-terracotta)',
                              color: 'white',
                            }}
                          >
                            {guest.display_name.charAt(0)}
                          </div>
                          <span style={{ color: isExpanded ? 'white' : 'var(--text-primary)' }}>
                            {guest.display_name}
                          </span>
                          {!isExpanded && guest.arrive_date && (
                            <span style={{ color: 'var(--text-tertiary)' }}>
                              {formatDate(guest.arrive_date)}
                              {guest.depart_date ? `\u2013${formatDate(guest.depart_date)}` : ''}
                            </span>
                          )}
                        </button>

                        {isExpanded && itinerary && (
                          <div
                            className="mt-1 mb-2 ml-3 p-3 rounded-lg text-xs space-y-2"
                            style={{ background: 'var(--bg-muted, #f9f8f6)' }}
                          >
                            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                              {guest.display_name}&apos;s travel plan
                            </p>
                            {itinerary.stops.map((s, si) => (
                              <div
                                key={si}
                                className="flex items-start gap-2"
                              >
                                <div
                                  className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                                  style={{
                                    background: s.city === stop.city
                                      ? 'var(--color-terracotta)'
                                      : 'var(--text-tertiary)',
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
                            {guest.open_to_meetup && (
                              <p style={{ color: '#10b981' }}>
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
