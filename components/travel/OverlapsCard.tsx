'use client';

import { useEffect, useState } from 'react';

interface CityOverlap {
  city: string;
  country: string;
  your_dates: { arrive: string; depart: string };
  overlapping_guests: Array<{
    display_name: string;
    arrive_date: string;
    depart_date: string;
    open_to_meetup: boolean;
  }>;
}

export default function OverlapsCard({ slug }: { slug: string }) {
  const [overlaps, setOverlaps] = useState<CityOverlap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/w/${slug}/travel/overlaps`)
      .then((res) => res.json())
      .then((data) => setOverlaps(data.data?.overlaps || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading || overlaps.length === 0) return null;

  return (
    <div className="card p-4 mt-4" style={{ borderLeft: '3px solid #3b82f6' }}>
      <h3
        className="font-medium mb-3 text-sm"
        style={{ color: 'var(--text-primary)' }}
      >
        &#129309; Your Travel Overlaps
      </h3>
      <div className="space-y-3">
        {overlaps.map((overlap) => (
          <div key={`${overlap.city}|${overlap.country}`}>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {overlap.city} ({overlap.your_dates.arrive} &ndash; {overlap.your_dates.depart})
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {overlap.overlapping_guests.map((g) => g.display_name).join(', ')}
              {overlap.overlapping_guests.length === 1 ? ' is' : ' are'} there at the same time!
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
