'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import GuestAccountMenu from '@/components/guest/GuestAccountMenu';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { usePreviewMode } from '@/lib/hooks/usePreviewMode';

export default function GuestHomePage() {
  const { config, guest, slug, isAuthenticated, isLoading, configError, retryConfig } = useWedding();
  const router = useRouter();
  const { unlocked, tryUnlock } = usePreviewMode();
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  // Calculate countdown
  const countdown = useMemo(() => {
    if (!config?.wedding_date) return null;
    const tz = config.timezone || 'America/New_York';
    const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const weddingDate = new Date(config.wedding_date + 'T12:00:00');
    const diff = weddingDate.getTime() - nowInTz.getTime();
    if (diff <= 0) return { days: 0, hours: 0, mins: 0 };
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return { days, hours, mins };
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
      <div className="pb-24 px-6 pt-24 max-w-4xl mx-auto">
        <div className="skeleton h-6 w-36 mb-2" />
        <div className="skeleton h-10 w-64 mb-8" />
        <div className="skeleton h-28 w-full mb-8 rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="skeleton h-48 rounded-xl" />
          <div className="skeleton h-48 rounded-xl" />
          <div className="skeleton h-40 rounded-xl" />
          <div className="skeleton h-40 rounded-xl" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="pb-32 pt-6 max-w-4xl mx-auto">
      {/* Top App Bar */}
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
        style={{
          background: 'rgba(250, 249, 245, 0.90)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => { if (!unlocked) setShowPasswordPrompt(true); }}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'default', lineHeight: 0 }}
            aria-label="menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="1.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1
            className="text-2xl tracking-wide"
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              color: 'var(--color-gold-dark)',
            }}
          >
            ReWed
          </h1>
        </div>
        <GuestAccountMenu />
      </header>

      <main className="px-6 pt-20 space-y-10">
        {/* Welcome Greeting & Countdown */}
        <section className="space-y-5">
          <div className="space-y-1">
            <p
              className="text-lg"
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                color: 'var(--color-terracotta)',
              }}
            >
              Welcome back, {guest.first_name}
            </p>
            <h2
              className="text-4xl lg:text-5xl leading-tight"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              {config.display_name}
            </h2>
          </div>

          {/* Countdown Card */}
          {countdown && (
            <div
              className="p-6 rounded-xl flex flex-wrap gap-6 items-center"
              style={{
                background: 'var(--bg-pure-white)',
                boxShadow: '0 32px 64px -12px rgba(27, 28, 26, 0.06)',
                border: '1px solid var(--border-light)',
              }}
            >
              <div className="flex flex-wrap gap-6">
                {[
                  { value: countdown.days, label: 'Days' },
                  { value: countdown.hours, label: 'Hours' },
                  { value: countdown.mins, label: 'Mins' },
                ].map((item, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <span
                      className="text-3xl"
                      style={{ fontFamily: 'var(--font-display)', color: 'var(--color-gold-dark)' }}
                    >
                      {item.value}
                    </span>
                    <span
                      className="text-[10px] font-semibold uppercase tracking-widest"
                      style={{ color: 'var(--color-olive)', fontFamily: 'var(--font-body)' }}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="ml-auto">
                <Link
                  href={`/w/${slug}/schedule`}
                  className="inline-block px-5 py-2 rounded text-sm font-semibold tracking-wide"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
                    color: 'var(--bg-warm-white)',
                    textDecoration: 'none',
                    boxShadow: '0 2px 8px rgba(198, 163, 85, 0.2)',
                  }}
                >
                  RSVP Details
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* Bento Grid — 2-col base, items span as needed */}
        <section className="grid grid-cols-2 gap-4">

          {/* Schedule — Full width hero card */}
          <Link
            href={`/w/${slug}/schedule`}
            className="col-span-2 group overflow-hidden rounded-2xl flex flex-col sm:flex-row relative transition-all duration-500 hover:shadow-lg"
            style={{
              background: 'var(--bg-soft-cream)',
              textDecoration: 'none',
            }}
          >
            <div className="p-7 flex-1 flex flex-col justify-between z-10">
              <div className="space-y-3">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <h3
                  className="text-2xl"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                >
                  Schedule
                </h3>
                <p className="text-sm leading-relaxed max-w-[260px]" style={{ color: 'var(--text-secondary)' }}>
                  Events, venues, dress codes &amp; directions
                </p>
              </div>
              <div className="mt-5 flex items-center gap-2 text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--color-gold-dark)' }}>
                Explore Events
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="w-full sm:w-2/5 h-40 sm:h-auto overflow-hidden relative">
              {config.home_card_images?.schedule ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={config.home_card_images.schedule.url}
                  alt=""
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ objectPosition: config.home_card_images.schedule.position }}
                />
              ) : (
                <div
                  className="w-full h-full transition-transform duration-700 group-hover:scale-105"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-gold-faint) 0%, rgba(212,175,55,0.15) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-rule)" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
              )}
            </div>
          </Link>

          {/* Social Feed — half width */}
          <Link
            href={`/w/${slug}/feed`}
            className="col-span-1 group p-6 rounded-2xl flex flex-col justify-between transition-all hover:shadow-md"
            style={{
              background: 'rgba(122, 139, 92, 0.06)',
              border: '1px solid rgba(122, 139, 92, 0.1)',
              textDecoration: 'none',
              minHeight: 180,
            }}
          >
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-olive)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 00-3-3.87" />
                  <path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
                <span
                  className="text-[9px] font-bold uppercase tracking-tight px-2 py-0.5 rounded"
                  style={{ background: 'rgba(122, 139, 92, 0.1)', color: 'var(--color-olive)' }}
                >
                  Live
                </span>
              </div>
              <h3
                className="text-xl"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
              >
                Social Feed
              </h3>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Share moments with everyone
              </p>
            </div>
          </Link>

          {/* FAQ — half width */}
          <Link
            href={`/w/${slug}/faq`}
            className="col-span-1 group p-6 rounded-2xl flex flex-col justify-between transition-all hover:shadow-md"
            style={{
              background: 'var(--bg-pure-white)',
              border: '1px solid var(--border-light)',
              textDecoration: 'none',
              minHeight: 180,
            }}
          >
            <div className="space-y-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-mediterranean-blue, #2B5F8A)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <h3
                className="text-xl"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
              >
                FAQ
              </h3>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Ask the chatbot anything about the wedding
              </p>
            </div>
          </Link>

          {/* Preview mode cards — slot in when unlocked */}
          {unlocked && (
            <>
              {/* Gallery */}
              <Link
                href={`/w/${slug}/gallery`}
                className="col-span-1 group p-6 rounded-2xl flex flex-col justify-between transition-all hover:shadow-md"
                style={{
                  background: 'var(--bg-pure-white)',
                  border: '1px solid var(--border-light)',
                  textDecoration: 'none',
                  minHeight: 180,
                }}
              >
                <div className="space-y-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <h3
                    className="text-xl"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                  >
                    Gallery
                  </h3>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    Photos, videos &amp; AI portraits
                  </p>
                </div>
                <div className="pt-4 flex -space-x-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full border-2"
                      style={{
                        borderColor: 'var(--bg-pure-white)',
                        background: `linear-gradient(${135 + i * 30}deg, var(--color-gold-faint), rgba(198,163,85,0.15))`,
                      }}
                    />
                  ))}
                  <div
                    className="w-8 h-8 rounded-full border-2 flex items-center justify-center"
                    style={{
                      borderColor: 'var(--bg-pure-white)',
                      background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
                    }}
                  >
                    <span className="text-[10px] font-bold" style={{ color: 'var(--bg-warm-white)' }}>+</span>
                  </div>
                </div>
              </Link>

              {/* Song Requests */}
              <Link
                href={`/w/${slug}/music`}
                className="col-span-1 group p-6 rounded-2xl flex flex-col justify-between transition-all hover:shadow-md"
                style={{
                  background: 'rgba(232, 134, 90, 0.06)',
                  border: '1px solid rgba(157, 66, 43, 0.1)',
                  textDecoration: 'none',
                  minHeight: 180,
                }}
              >
                <div className="space-y-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                  <h3
                    className="text-xl"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                  >
                    Song Requests
                  </h3>
                  <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    What gets you on the dance floor?
                  </p>
                </div>
              </Link>

              {/* My Table — full width */}
              <Link
                href={`/w/${slug}/seating`}
                className="col-span-2 group p-6 rounded-2xl flex items-center gap-6 transition-all hover:shadow-md"
                style={{
                  background: 'var(--bg-pure-white)',
                  border: '1px solid var(--border-light)',
                  textDecoration: 'none',
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <path d="M4 18v-4a2 2 0 012-2h12a2 2 0 012 2v4" />
                  <path d="M8 12V8a4 4 0 018 0v4" />
                  <line x1="2" y1="18" x2="22" y2="18" />
                </svg>
                <div className="flex-1 min-w-0">
                  <h3
                    className="text-xl"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                  >
                    My Table
                  </h3>
                  <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                    Find your seat &amp; meet your tablemates
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </>
          )}

          {/* Travel — Full width */}
          <Link
            href={`/w/${slug}/travel`}
            className="col-span-2 group overflow-hidden rounded-2xl flex flex-col transition-all hover:shadow-lg"
            style={{
              background: 'var(--bg-soft-cream)',
              textDecoration: 'none',
            }}
          >
            <div className="h-32 overflow-hidden relative">
              {config.home_card_images?.travel ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={config.home_card_images.travel.url}
                  alt=""
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ objectPosition: config.home_card_images.travel.position }}
                />
              ) : (
                <div
                  className="w-full h-full relative"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-gold-faint) 0%, rgba(43, 95, 138, 0.08) 100%)',
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-rule)" strokeWidth="0.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
                      <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.4-.1.9.3 1.1l5.6 3.3-3 3-2.3-.8c-.3-.1-.7 0-.9.3l-.2.3c-.2.3-.1.7.1.9l3.3 2.5 2.5 3.3c.2.3.6.4.9.1l.3-.2c.3-.2.4-.6.3-.9l-.8-2.3 3-3 3.3 5.6c.2.4.7.5 1.1.3l.5-.3c.4-.2.6-.6.5-1.1z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <h3
                    className="text-xl"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                  >
                    Travel
                  </h3>
                </div>
                <span
                  className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
                  style={{ background: 'var(--color-gold-faint)', color: 'var(--color-gold-dark)' }}
                >
                  Friends Nearby
                </span>
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Share plans, find friends nearby, or coordinate a ride
              </p>
            </div>
          </Link>
        </section>
      </main>

      {/* Password prompt for preview mode */}
      {showPasswordPrompt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
          onClick={() => { setShowPasswordPrompt(false); setPasswordInput(''); setPasswordError(false); }}
        >
          <div
            className="rounded-2xl p-6"
            style={{
              background: 'var(--bg-warm-white)',
              width: '100%',
              maxWidth: 300,
              boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p
              className="text-center mb-4"
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontSize: 16,
                color: 'var(--text-primary)',
              }}
            >
              Preview mode
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (tryUnlock(passwordInput)) {
                  setShowPasswordPrompt(false);
                  setPasswordInput('');
                  setPasswordError(false);
                } else {
                  setPasswordError(true);
                }
              }}
            >
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
                placeholder="Password"
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: `1.5px solid ${passwordError ? '#ef4444' : 'var(--border-medium)'}`,
                  background: 'var(--bg-pure-white)',
                  fontSize: 14,
                  fontFamily: 'var(--font-body)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {passwordError && (
                <p className="text-xs mt-1.5" style={{ color: '#ef4444' }}>
                  Incorrect password
                </p>
              )}
              <button
                type="submit"
                className="w-full mt-3 text-xs font-medium uppercase tracking-wide"
                style={{
                  padding: '10px 0',
                  background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
                  color: 'var(--bg-warm-white)',
                  border: 'none',
                  borderRadius: 50,
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                }}
              >
                Unlock
              </button>
            </form>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
