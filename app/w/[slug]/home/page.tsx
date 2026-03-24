'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import TravelListView from '@/components/travel/TravelListView';

interface Reminder {
  type: string;
  title: string;
  body: string;
  event_name?: string;
  when: string;
}

export default function GuestHomePage() {
  const { config, guest, slug, isAuthenticated, isLoading, configError, retryConfig, logout } = useWedding();
  const router = useRouter();
  const [hasPlan, setHasPlan] = useState<boolean | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  // Check travel plan
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch(`/api/v1/w/${slug}/travel/my-plan`)
      .then((res) => res.json())
      .then((data) => setHasPlan(!!data.data?.plan))
      .catch(() => setHasPlan(false));
  }, [slug, isAuthenticated]);

  // Fetch reminders
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch(`/api/v1/w/${slug}/reminders`)
      .then((res) => res.json())
      .then((data) => {
        if (data.data?.reminders) setReminders(data.data.reminders);
      })
      .catch(() => {});
  }, [slug, isAuthenticated]);

  // Calculate days until wedding
  const daysToGo = useMemo(() => {
    if (!config?.wedding_date) return null;
    const tz = config.timezone || 'America/New_York';
    const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const todayStr = `${nowInTz.getFullYear()}-${String(nowInTz.getMonth() + 1).padStart(2, '0')}-${String(nowInTz.getDate()).padStart(2, '0')}`;
    const todayMs = new Date(todayStr).getTime();
    const weddingMs = new Date(config.wedding_date + 'T12:00:00').getTime();
    return Math.max(0, Math.ceil((weddingMs - todayMs) / (1000 * 60 * 60 * 24)));
  }, [config]);

  if (configError && !isLoading) {
    return (
      <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
        <div className="card p-8 text-center mt-12">
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Couldn&apos;t load the wedding. Check your connection and try again.
          </p>
          <button
            onClick={retryConfig}
            className="px-6 py-2.5 rounded-full text-sm font-medium text-white"
            style={{ background: 'var(--color-terracotta-gradient)' }}
          >
            Retry
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (isLoading || !config || !guest) {
    return (
      <div className="pb-24 px-5 pt-8">
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="skeleton h-5 w-32 mb-6" />
        <div className="skeleton h-40 w-full mb-4 rounded-2xl" />
        <div className="skeleton h-32 w-full rounded-2xl" />
        <BottomNav />
      </div>
    );
  }

  const activeLinks = [
    { label: 'Schedule', sub: `${config.events.length} event${config.events.length !== 1 ? 's' : ''}`, desc: 'View all events, venues, dress codes, and directions', href: `/w/${slug}/schedule` },
    { label: 'Travel', sub: 'Plans & meetups', desc: 'Share your travel plans, find friends nearby, or share a ride', href: `/w/${slug}/travel` },
    { label: 'FAQ', sub: 'Questions?', desc: 'Ask the chatbot anything about the wedding', href: `/w/${slug}/faq` },
    { label: 'Social Feed', sub: 'Posts & updates', desc: 'Share photos, videos, and moments with everyone', href: `/w/${slug}/feed` },
  ];

  const comingSoonLinks = [
    { label: 'Gallery', sub: 'Photos & video' },
    { label: 'My Table', sub: 'Seating chart' },
    { label: 'Song Requests', sub: 'DJ requests' },
    { label: 'Everyone\u2019s Photos', sub: 'Shared gallery' },
    { label: 'Guest List', sub: 'See who\u2019s coming' },
    { label: 'Keep in Touch', sub: 'Stay connected' },
    { label: 'My Memories', sub: 'Your personal page' },
  ];

  return (
    <div className="pb-24 px-7 pt-8 max-w-lg mx-auto">
      {/* Greeting */}
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[13px]" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
          Welcome back
        </p>
        <button
          onClick={logout}
          className="text-xs underline"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Not you?
        </button>
      </div>

      {/* Name in shimmer gold */}
      <h1
        className="shimmer-text mb-3"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 38,
          fontWeight: 400,
          lineHeight: 1.05,
          letterSpacing: '-0.01em',
          display: 'inline-block',
        }}
      >
        {guest.first_name}
      </h1>

      {/* Countdown + wedding name */}
      <div className="flex items-center gap-2 mb-8">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 0L9.33 4.5L5 10L0.67 4.5L5 0Z" fill="var(--color-gold)" opacity="0.5" />
        </svg>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {daysToGo !== null && (
            <>
              <span style={{ color: 'var(--color-gold)', fontWeight: 500 }}>{daysToGo} days</span>
              <span style={{ margin: '0 8px', color: 'var(--text-tertiary)' }}>&middot;</span>
            </>
          )}
          {config.display_name}
        </span>
      </div>

      {/* Gold divider */}
      <div className="gold-divider mb-2" />

      {/* Reminders */}
      {reminders.length > 0 && (
        <div className="mb-6 space-y-3">
          {reminders.map((r, i) => (
            <div
              key={i}
              className="p-4 rounded-2xl"
              style={{
                background: r.type === 'today' ? 'var(--color-gold-faint)' : 'var(--bg-pure-white)',
                border: r.type === 'today' ? '1px solid var(--color-gold-rule)' : '1px solid var(--border-light)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <p
                className="text-sm font-medium mb-1"
                style={{ color: r.type === 'today' ? 'var(--color-gold-dark)' : 'var(--text-primary)' }}
              >
                {r.title}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {r.body}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Active Quick Links */}
      <div className="mb-2">
        {activeLinks.map((link, i) => (
          <div key={i}>
            <Link
              href={link.href}
              className="flex items-center justify-between py-4"
              style={{ textDecoration: 'none' }}
            >
              <div className="flex-1 min-w-0 pr-3">
                <div className="flex items-baseline gap-2">
                  <p className="text-[15px] font-medium" style={{ color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
                    {link.label}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {link.sub}
                  </p>
                </div>
                {link.desc && (
                  <p className="text-[12px] mt-1" style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {link.desc}
                  </p>
                )}
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </Link>
            {i < activeLinks.length - 1 && (
              <div style={{ height: 0.5, background: 'var(--border-light)' }} />
            )}
          </div>
        ))}
      </div>

      {/* Coming Soon — collapsible */}
      <div className="mb-8">
        <button
          onClick={() => setComingSoonOpen((prev) => !prev)}
          className="flex items-center justify-between w-full py-3"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span
              className="text-[13px]"
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                color: 'var(--text-secondary)',
              }}
            >
              More features
            </span>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-tertiary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: comingSoonOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {comingSoonOpen && (
          <div
            className="rounded-2xl p-5 mt-1"
            style={{
              background: 'var(--color-gold-faint)',
              border: '0.5px solid var(--color-gold-rule)',
            }}
          >
            <p
              className="text-center mb-4"
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontSize: 15,
                color: 'var(--text-primary)',
                lineHeight: 1.4,
              }}
            >
              Coming soon &mdash; more features will be revealed closer to the wedding!
            </p>
            <div style={{ opacity: 0.5 }}>
              {comingSoonLinks.map((link, i) => (
                <div key={i}>
                  <div className="flex items-baseline gap-2 py-3">
                    <p className="text-[14px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {link.label}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      {link.sub}
                    </p>
                  </div>
                  {i < comingSoonLinks.length - 1 && (
                    <div style={{ height: 0.5, background: 'var(--color-gold-rule)' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Travel CTA */}
      {hasPlan === false && (
        <div
          className="gold-glow text-center mb-10"
          style={{
            borderRadius: 16,
            padding: '32px 24px',
            background: 'var(--color-gold-faint)',
            border: '0.5px solid var(--color-gold-rule)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontStyle: 'italic',
              color: 'var(--text-primary)',
              marginBottom: 6,
              lineHeight: 1.4,
              fontWeight: 400,
            }}
          >
            Where is everyone traveling?
          </p>
          <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Share your plans to find friends nearby
          </p>
          <button
            onClick={() => router.push(`/w/${slug}/travel`)}
            className="text-xs font-medium uppercase tracking-wide"
            style={{
              padding: '12px 36px',
              background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold), var(--color-gold-light))',
              color: 'var(--bg-warm-white)',
              border: 'none',
              borderRadius: 50,
              cursor: 'pointer',
              letterSpacing: '0.06em',
              boxShadow: '0 4px 16px rgba(198, 163, 85, 0.25)',
            }}
          >
            Add My Travel Plans
          </button>
        </div>
      )}

      {/* Travel list */}
      <TravelListView
        slug={slug}
        hasPlan={hasPlan}
        onAddPlan={() => router.push(`/w/${slug}/travel`)}
      />

      <BottomNav />
    </div>
  );
}
