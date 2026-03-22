'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import CityAutocomplete, { type CityResult } from '@/components/travel/CityAutocomplete';

// Map of city/country to IANA timezone
const CITY_TIMEZONE_MAP: Record<string, string> = {
  'ES': 'Europe/Madrid', 'FR': 'Europe/Paris', 'IT': 'Europe/Rome',
  'DE': 'Europe/Berlin', 'GB': 'Europe/London', 'NL': 'Europe/Amsterdam',
  'CH': 'Europe/Zurich', 'GR': 'Europe/Athens', 'TR': 'Europe/Istanbul',
  'PT': 'Europe/Lisbon', 'IN': 'Asia/Kolkata', 'JP': 'Asia/Tokyo',
  'CN': 'Asia/Shanghai', 'KR': 'Asia/Seoul', 'TH': 'Asia/Bangkok',
  'SG': 'Asia/Singapore', 'AE': 'Asia/Dubai', 'AU': 'Australia/Sydney',
  'NZ': 'Pacific/Auckland', 'BR': 'America/Sao_Paulo', 'MX': 'America/Mexico_City',
  'AR': 'America/Argentina/Buenos_Aires', 'ZA': 'Africa/Johannesburg',
  'EG': 'Africa/Cairo', 'NG': 'Africa/Lagos',
};

function getTimezoneForCountry(countryCode: string): string | null {
  return CITY_TIMEZONE_MAP[countryCode] || null;
}

interface WeddingOverview {
  wedding: {
    id: string;
    slug: string;
    display_name: string;
    wedding_date: string | null;
    timezone: string | null;
    status: string;
    config: Record<string, unknown>;
    package_config: Record<string, unknown>;
    venue_city: string | null;
    venue_country: string | null;
    venue_lat: number | null;
    venue_lng: number | null;
  };
  stats: {
    guests: { total: number; attending: number; declined: number; pending: number };
    events: number;
    uploads: { total: number; photos: number; videos: number };
    faq_entries: number;
    feed_posts: number;
  };
}

export default function WeddingOverviewPage({
  params,
}: {
  params: Promise<{ weddingId: string }>;
}) {
  const { weddingId } = use(params);
  const [data, setData] = useState<WeddingOverview | null>(null);
  const [loading, setLoading] = useState(true);

  // Location state
  const [venueCity, setVenueCity] = useState<string | null>(null);
  const [venueCountry, setVenueCountry] = useState<string | null>(null);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationSaved, setLocationSaved] = useState(false);

  // QR code state
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [guestUrl, setGuestUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrRegenerating, setQrRegenerating] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/dashboard/weddings/${weddingId}/overview`)
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        if (d?.wedding) {
          setVenueCity(d.wedding.venue_city || null);
          setVenueCountry(d.wedding.venue_country || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [weddingId]);

  const fetchQrCode = useCallback(async () => {
    setQrLoading(true);
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/qr-code?format=json`);
      if (res.ok) {
        const json = await res.json();
        setQrUrl(json.data?.qr_url || null);
        setGuestUrl(json.data?.guest_url || null);
      }
    } catch {
      // silently fail
    } finally {
      setQrLoading(false);
    }
  }, [weddingId]);

  useEffect(() => { fetchQrCode(); }, [fetchQrCode]);

  const handleLocationSelect = async (city: CityResult) => {
    setLocationSaving(true);
    setLocationSaved(false);
    try {
      // Also auto-set timezone based on country code
      const autoTz = getTimezoneForCountry(city.country_code);
      const body: Record<string, unknown> = {
        venue_city: city.city,
        venue_country: city.country,
        venue_lat: city.latitude,
        venue_lng: city.longitude,
      };
      if (autoTz) body.timezone = autoTz;

      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setVenueCity(city.city);
        setVenueCountry(city.country);
        setLocationSaved(true);
        // Update the data state to reflect new location in the header
        setData((prev) => prev ? {
          ...prev,
          wedding: { ...prev.wedding, venue_city: city.city, venue_country: city.country, venue_lat: city.latitude, venue_lng: city.longitude, timezone: autoTz || prev.wedding.timezone },
        } : prev);
        setTimeout(() => setLocationSaved(false), 2000);
      }
    } catch {
      // Silently fail
    } finally {
      setLocationSaving(false);
    }
  };

  const regenerateQr = async () => {
    setQrRegenerating(true);
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/qr-code`, { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        setQrUrl(json.data?.qr_url || null);
        setGuestUrl(json.data?.guest_url || null);
      }
    } catch {
      // silently fail
    } finally {
      setQrRegenerating(false);
    }
  };

  const downloadQr = async () => {
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/qr-code?format=png`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${data?.wedding?.slug || 'wedding'}-qr-code.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // silently fail
    }
  };

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 300, height: 32, marginBottom: 24 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card p-6">
              <div className="skeleton" style={{ width: '60%', height: 16, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '40%', height: 32 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card p-8 text-center">
        <p style={{ color: 'var(--text-secondary)' }}>Failed to load wedding data.</p>
        <Link href="/dashboard" className="btn-secondary" style={{ marginTop: 12, display: 'inline-block' }}>
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const { wedding, stats } = data;

  const statCards = [
    { label: 'Total Guests', value: stats.guests.total, sub: `${stats.guests.attending} attending`, link: `/dashboard/${weddingId}/guests`, color: 'var(--color-terracotta)' },
    { label: 'Events', value: stats.events, sub: 'scheduled', link: `/dashboard/${weddingId}/settings`, color: 'var(--color-golden)' },
    { label: 'Photos', value: stats.uploads.photos, sub: `${stats.uploads.videos} videos`, link: null, color: 'var(--color-olive)' },
    { label: 'FAQ Entries', value: stats.faq_entries, sub: 'for chatbot', link: `/dashboard/${weddingId}/faq`, color: 'var(--color-mediterranean-blue)' },
    { label: 'Feed Posts', value: stats.feed_posts, sub: 'from guests', link: `/dashboard/${weddingId}/feed`, color: 'var(--color-dusty-rose)' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 500,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          {wedding.display_name}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 4 }}>
          {wedding.wedding_date
            ? new Date(wedding.wedding_date + 'T12:00:00').toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric',
                timeZone: wedding.timezone || 'America/New_York',
              })
            : 'Date not set'}
          {venueCity && (
            <> &middot; {venueCity}{venueCountry ? `, ${venueCountry}` : ''}</>
          )}
          {' · '}
          <span
            style={{
              display: 'inline-block',
              padding: '2px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              background: wedding.status === 'active' ? 'rgba(122, 139, 92, 0.12)' : 'rgba(196, 112, 75, 0.1)',
              color: wedding.status === 'active' ? 'var(--color-olive)' : 'var(--color-terracotta)',
            }}
          >
            {wedding.status}
          </span>
        </p>
      </div>

      {/* Quick action banner if no guests */}
      {stats.guests.total === 0 && (
        <div
          className="card"
          style={{
            padding: '20px 24px',
            marginBottom: 24,
            background: 'rgba(196, 112, 75, 0.04)',
            border: '1px solid rgba(196, 112, 75, 0.15)',
          }}
        >
          <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, margin: '0 0 8px' }}>
            Get started by adding your guest list
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
            Import a CSV from Zola or The Knot, or add guests manually.
          </p>
          <Link href={`/dashboard/${weddingId}/guests`} className="btn-primary" style={{ fontSize: 13, padding: '8px 20px' }}>
            Add Guests
          </Link>
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        {statCards.map((card) => {
          const inner = (
            <div className="card" style={{ padding: '20px 24px', background: 'var(--bg-pure-white)' }}>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {card.label}
              </p>
              <p style={{ fontSize: 32, fontWeight: 600, color: card.color, margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
                {card.value}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{card.sub}</p>
            </div>
          );

          if (card.link) {
            return (
              <Link key={card.label} href={card.link} style={{ textDecoration: 'none' }}>
                {inner}
              </Link>
            );
          }
          return <div key={card.label}>{inner}</div>;
        })}
      </div>

      {/* Wedding Location */}
      <div className="card" style={{ padding: 24, background: 'var(--bg-pure-white)', marginBottom: 24, overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Wedding Location
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Set your wedding city to auto-fill timezone and guest travel destinations.
            </p>
          </div>
          {locationSaved && (
            <span style={{ fontSize: 12, color: 'var(--color-olive)', fontWeight: 500 }}>Saved!</span>
          )}
          {locationSaving && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Saving...</span>
          )}
        </div>
        {venueCity ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(196, 112, 75, 0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
                  {venueCity}{venueCountry ? `, ${venueCountry}` : ''}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                  Timezone: {wedding.timezone || 'America/New_York'}
                </p>
              </div>
            </div>
            <button
              onClick={() => { setVenueCity(null); setVenueCountry(null); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-terracotta)', fontFamily: 'var(--font-body)', fontWeight: 500 }}
            >
              Change
            </button>
          </div>
        ) : (
          <CityAutocomplete
            value=""
            onSelect={handleLocationSelect}
            placeholder="Search for your wedding city..."
          />
        )}
      </div>

      {/* QR Code / Share Section */}
      <div className="card" style={{ padding: 24, background: 'var(--bg-pure-white)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 4px' }}>
          Share with Guests
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' }}>
          Share this QR code at your wedding so guests can access the app instantly.
        </p>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* QR Code image */}
          <div
            style={{
              width: 180,
              height: 180,
              borderRadius: 16,
              background: 'var(--bg-soft-cream)',
              border: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {qrLoading ? (
              <div className="skeleton" style={{ width: 140, height: 140 }} />
            ) : qrUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={qrUrl} alt="Wedding QR Code" style={{ width: 160, height: 160, objectFit: 'contain' }} />
            ) : (
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="3" height="3" /><rect x="18" y="14" width="3" height="3" /><rect x="14" y="18" width="3" height="3" /><rect x="18" y="18" width="3" height="3" />
              </svg>
            )}
          </div>

          {/* Info + actions */}
          <div style={{ flex: 1 }}>
            {guestUrl && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>Guest URL</p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: 'var(--bg-soft-cream)',
                    border: '1px solid var(--border-light)',
                  }}
                >
                  <code style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {guestUrl}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(guestUrl); }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: 'var(--color-terracotta)',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500,
                      flexShrink: 0,
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={downloadQr}
                className="btn-primary"
                style={{ fontSize: 13, padding: '8px 20px' }}
              >
                Download QR Code
              </button>
              <button
                onClick={regenerateQr}
                disabled={qrRegenerating}
                className="btn-secondary"
                style={{ fontSize: 13, padding: '8px 20px', opacity: qrRegenerating ? 0.6 : 1 }}
              >
                {qrRegenerating ? 'Regenerating...' : 'Regenerate QR'}
              </button>
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12 }}>
              Regenerate the QR code if you changed your wedding URL, or if you need a fresh code.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
