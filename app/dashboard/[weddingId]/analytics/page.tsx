'use client';

import { useState, useEffect, use } from 'react';

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
        <div className="skeleton" style={{ width: 200, height: 32, marginBottom: 24 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card p-6"><div className="skeleton" style={{ width: '100%', height: 80 }} /></div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return <p style={{ color: 'var(--text-secondary)' }}>Failed to load analytics.</p>;
  }

  const rsvpRate = stats.guests.total > 0
    ? Math.round(((stats.guests.attending + stats.guests.declined) / stats.guests.total) * 100)
    : 0;

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 24 }}>
        Analytics
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 32 }}>
        {/* RSVP Overview */}
        <div className="card" style={{ padding: 24, background: 'var(--bg-pure-white)' }}>
          <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: 16 }}>
            RSVP Overview
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-olive)', margin: 0 }}>{stats.guests.attending}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Attending</p>
            </div>
            <div>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-terracotta)', margin: 0 }}>{stats.guests.declined}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Declined</p>
            </div>
            <div>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-tertiary)', margin: 0 }}>{stats.guests.pending}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Pending</p>
            </div>
          </div>
          <div style={{ marginTop: 12, height: 6, borderRadius: 3, background: 'var(--bg-soft-cream)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', height: '100%' }}>
              <div style={{ width: `${stats.guests.total > 0 ? (stats.guests.attending / stats.guests.total) * 100 : 0}%`, background: 'var(--color-olive)' }} />
              <div style={{ width: `${stats.guests.total > 0 ? (stats.guests.declined / stats.guests.total) * 100 : 0}%`, background: 'var(--color-terracotta)' }} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>{rsvpRate}% response rate</p>
        </div>

        {/* Media Uploads */}
        <div className="card" style={{ padding: 24, background: 'var(--bg-pure-white)' }}>
          <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: 16 }}>
            Media Uploads
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-golden)', margin: 0 }}>{stats.uploads.photos}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Photos</p>
            </div>
            <div>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-mediterranean-blue)', margin: 0 }}>{stats.uploads.videos}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Videos</p>
            </div>
            <div>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{stats.uploads.total}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Total</p>
            </div>
          </div>
        </div>

        {/* Engagement */}
        <div className="card" style={{ padding: 24, background: 'var(--bg-pure-white)' }}>
          <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: 16 }}>
            Engagement
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-dusty-rose)', margin: 0 }}>{stats.feed_posts}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Feed Posts</p>
            </div>
            <div>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-mediterranean-blue)', margin: 0 }}>{stats.faq_entries}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>FAQ Entries</p>
            </div>
          </div>
        </div>

        {/* Event Setup */}
        <div className="card" style={{ padding: 24, background: 'var(--bg-pure-white)' }}>
          <h3 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: 16 }}>
            Setup Progress
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Guests added', done: stats.guests.total > 0 },
              { label: 'Events configured', done: stats.events > 0 },
              { label: 'FAQ entries added', done: stats.faq_entries > 0 },
              { label: 'Media uploaded', done: stats.uploads.total > 0 },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
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
                <span style={{ fontSize: 13, color: item.done ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
