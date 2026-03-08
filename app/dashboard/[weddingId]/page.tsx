'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface WeddingOverview {
  wedding: {
    id: string;
    slug: string;
    display_name: string;
    wedding_date: string | null;
    status: string;
    config: Record<string, unknown>;
    package_config: Record<string, unknown>;
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

  useEffect(() => {
    fetch(`/api/v1/dashboard/weddings/${weddingId}/overview`)
      .then((res) => res.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [weddingId]);

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
    { label: 'RSVP Pending', value: stats.guests.pending, sub: `${stats.guests.declined} declined`, link: `/dashboard/${weddingId}/guests`, color: 'var(--text-tertiary)' },
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
            ? new Date(wedding.wedding_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : 'Date not set'}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
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
    </div>
  );
}
