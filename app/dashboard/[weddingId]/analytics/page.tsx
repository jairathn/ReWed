'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface Stats {
  guests: { total: number; attending: number; declined: number; pending: number };
  events: number;
  uploads: { total: number; photos: number; videos: number };
  faq_entries: number;
  feed_posts: number;
}

export default function AnalyticsPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/dashboard/weddings/${weddingId}/overview`)
      .then((res) => res.json())
      .then((data) => setStats(data.stats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [weddingId]);

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 200, height: 32, marginBottom: 24, borderRadius: 8 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ padding: 24, borderRadius: 16, background: 'var(--bg-pure-white)', border: '1px solid var(--border-light)' }}>
              <div className="skeleton" style={{ width: '100%', height: 80, borderRadius: 8 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return <p style={{ color: 'var(--text-secondary)' }}>Failed to load analytics.</p>;
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
          Analytics
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>
          Overview of your wedding engagement
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 32 }}>
        {/* Guest Summary */}
        <div style={{ padding: 24, borderRadius: 16, background: 'var(--bg-pure-white)', border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(196,112,75,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
              </svg>
            </div>
            <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', margin: 0, fontFamily: 'var(--font-body)' }}>
              Guest List
            </h3>
          </div>
          <p style={{ fontSize: 36, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>{stats.guests.total}</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>total guests</p>
          <div style={{ display: 'flex', gap: 16, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-light)' }}>
            <div>
              <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-olive)', margin: 0, fontFamily: 'var(--font-display)' }}>{stats.guests.attending}</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>attending</p>
            </div>
            <div>
              <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-terracotta)', margin: 0, fontFamily: 'var(--font-display)' }}>{stats.guests.declined}</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>declined</p>
            </div>
            <div>
              <p style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-gold-dark)', margin: 0, fontFamily: 'var(--font-display)' }}>{stats.guests.pending}</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>pending</p>
            </div>
          </div>
        </div>

        {/* Media Uploads */}
        <div style={{ padding: 24, borderRadius: 16, background: 'var(--bg-pure-white)', border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(198,163,85,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', margin: 0, fontFamily: 'var(--font-body)' }}>
              Media Uploads
            </h3>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-golden)', margin: 0, fontFamily: 'var(--font-display)' }}>{stats.uploads.photos}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>Photos</p>
            </div>
            <div>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-mediterranean-blue)', margin: 0, fontFamily: 'var(--font-display)' }}>{stats.uploads.videos}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>Videos</p>
            </div>
            <div>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>{stats.uploads.total}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>Total</p>
            </div>
          </div>
        </div>

        {/* Engagement */}
        <div style={{ padding: 24, borderRadius: 16, background: 'var(--bg-pure-white)', border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(122,139,92,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-olive)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', margin: 0, fontFamily: 'var(--font-body)' }}>
              Engagement
            </h3>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-dusty-rose)', margin: 0, fontFamily: 'var(--font-display)' }}>{stats.feed_posts}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>Feed Posts</p>
            </div>
            <div>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-mediterranean-blue)', margin: 0, fontFamily: 'var(--font-display)' }}>{stats.faq_entries}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>FAQ Entries</p>
            </div>
          </div>
        </div>

        {/* Setup Progress */}
        <div style={{ padding: 24, borderRadius: 16, background: 'var(--bg-pure-white)', border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(43,95,138,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-mediterranean-blue, #2B5F8A)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
            </div>
            <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', margin: 0, fontFamily: 'var(--font-body)' }}>
              Setup Progress
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Guests added', done: stats.guests.total > 0, href: `/dashboard/${weddingId}/guests` },
              { label: 'Events configured', done: stats.events > 0, href: `/dashboard/${weddingId}/settings` },
              { label: 'FAQ entries added', done: stats.faq_entries > 0, href: `/dashboard/${weddingId}/faq` },
              { label: 'Media uploaded', done: stats.uploads.total > 0, href: `/dashboard/${weddingId}/gallery-curation` },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textDecoration: 'none',
                  padding: '2px 0',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  border: item.done ? 'none' : '1.5px solid var(--border-medium)',
                  background: item.done ? 'var(--color-olive)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {item.done && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: 13, color: item.done ? 'var(--text-primary)' : 'var(--text-tertiary)', fontFamily: 'var(--font-body)', flex: 1 }}>{item.label}</span>
                {!item.done && (
                  <span style={{ fontSize: 11, color: 'var(--color-terracotta)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                    Set up →
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
