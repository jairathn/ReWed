'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function GuestHomePage() {
  const { config, guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  if (isLoading || !config || !guest) {
    return (
      <div className="pb-24 px-5 pt-8">
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="skeleton h-5 w-32 mb-6" />
        <div className="skeleton h-32 w-full mb-4 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-40 rounded-2xl" />
          <div className="skeleton h-40 rounded-2xl" />
        </div>
        <BottomNav />
      </div>
    );
  }

  // Calculate days until wedding in the wedding's timezone
  const tz = config.timezone || 'America/New_York';
  const daysToGo = config.wedding_date
    ? (() => {
        const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
        const todayStr = `${nowInTz.getFullYear()}-${String(nowInTz.getMonth() + 1).padStart(2, '0')}-${String(nowInTz.getDate()).padStart(2, '0')}`;
        const todayMs = new Date(todayStr).getTime();
        const weddingMs = new Date(config.wedding_date!).getTime();
        return Math.max(0, Math.ceil((weddingMs - todayMs) / (1000 * 60 * 60 * 24)));
      })()
    : null;

  // Find next upcoming event (comparing in wedding timezone)
  const upNextEvent = config.events.find((e) => {
    if (!e.date) return false;
    const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const todayStr = `${nowInTz.getFullYear()}-${String(nowInTz.getMonth() + 1).padStart(2, '0')}-${String(nowInTz.getDate()).padStart(2, '0')}`;
    return e.date >= todayStr;
  });

  return (
    <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
      {/* Welcome Greeting */}
      <h1
        className="text-2xl font-medium mb-1"
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)',
        }}
      >
        Welcome back, {guest.first_name}
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        {config.display_name}
      </p>

      {/* Up Next Event Banner */}
      {upNextEvent && (
        <div
          className="glass px-5 py-3 mb-6 flex items-center gap-3"
          style={{
            background: `${upNextEvent.accent_color || 'var(--color-terracotta)'}15`,
            borderRadius: '16px',
            border: `1px solid ${upNextEvent.accent_color || 'var(--color-terracotta)'}30`,
          }}
        >
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              background: upNextEvent.accent_color || 'var(--color-terracotta)',
            }}
          />
          <div>
            <p
              className="text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              Up Next: {upNextEvent.name}
            </p>
            {upNextEvent.venue_name && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {upNextEvent.venue_name}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Hero Feature Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Link href={`/w/${slug}/video`} className="card-feature p-5 min-h-[160px] flex flex-col justify-between">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-white">Video Message</p>
            <p className="text-xs text-white/70 mt-0.5">Record a toast</p>
          </div>
        </Link>

        <Link
          href={`/w/${slug}/photo`}
          className="min-h-[160px] flex flex-col justify-between p-5 rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, #2B5F8A 0%, #4A8BC2 100%)',
            boxShadow: '0 4px 20px rgba(43, 95, 138, 0.25)',
            color: 'white',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              bottom: '-20px',
              left: '-20px',
            }}
          />
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
            style={{ background: 'rgba(255, 255, 255, 0.15)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold">Photo Booth</p>
            <p className="text-xs text-white/70 mt-0.5">Filters & portraits</p>
          </div>
        </Link>
      </div>

      {/* Secondary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Link href={`/w/${slug}/schedule`} className="card p-4 text-center">
          <div className="text-2xl mb-2">&#128197;</div>
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            Schedule
          </p>
        </Link>
        <Link href={`/w/${slug}/directory`} className="card p-4 text-center">
          <div className="text-2xl mb-2">&#128101;</div>
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            Guests
          </p>
        </Link>
        <Link href={`/w/${slug}/gallery`} className="card p-4 text-center">
          <div className="text-2xl mb-2">&#128247;</div>
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            Gallery
          </p>
        </Link>
      </div>

      {/* Feed & FAQ Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {config.features?.social_feed !== false && (
          <Link href={`/w/${slug}/feed`} className="card p-4 flex items-center gap-3">
            <div className="text-xl">&#128172;</div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Social Feed
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Share moments
              </p>
            </div>
          </Link>
        )}
        {config.features?.faq_chatbot !== false && (
          <Link href={`/w/${slug}/faq`} className="card p-4 flex items-center gap-3">
            <div className="text-xl">&#129302;</div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Ask Anything
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                FAQ & info
              </p>
            </div>
          </Link>
        )}
      </div>

      {/* Quick Stats */}
      {daysToGo !== null && (
        <div
          className="card px-5 py-4 flex items-center justify-between"
          style={{ background: 'var(--bg-pure-white)' }}
        >
          <div className="text-center flex-1">
            <p
              className="text-xl font-semibold"
              style={{ color: 'var(--color-terracotta)' }}
            >
              {config.events.length}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Events
            </p>
          </div>
          <div
            className="w-px h-8"
            style={{ background: 'var(--border-light)' }}
          />
          <div className="text-center flex-1">
            <p
              className="text-xl font-semibold"
              style={{ color: 'var(--color-terracotta)' }}
            >
              {daysToGo}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Days to go
            </p>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
