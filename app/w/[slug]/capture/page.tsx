'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';

// A small rotating set of sample prompts for the hero card — picks one per session.
const SAMPLE_PROMPTS = [
  "What's your favorite memory with the couple?",
  'What advice would you give the newlyweds?',
  'How did you know they were meant for each other?',
  'Describe the couple in exactly three words.',
  'What makes their love story special?',
];

export default function CapturePage() {
  const { config, guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  // Pick a sample prompt deterministically per guest. Prefer the couple's configured prompts.
  // Using the guest id as a hash gives each guest a consistent preview without impure randomness.
  const samplePrompt = useMemo(() => {
    const configured = config
      ? [
          ...(config.prompts?.heartfelt || []),
          ...(config.prompts?.fun || []),
          ...(config.prompts?.quick_takes || []),
        ]
      : [];
    const pool = configured.length > 0 ? configured : SAMPLE_PROMPTS;
    const seed = guest?.id || slug || '';
    const hash = Array.from(seed).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return pool[hash % pool.length];
  }, [config, guest?.id, slug]);

  if (isLoading || !config || !guest) {
    return (
      <div className="pb-24 px-6 pt-24 max-w-2xl mx-auto">
        <div className="skeleton h-12 w-48 mx-auto mb-4" />
        <div className="skeleton h-5 w-64 mx-auto mb-12" />
        <div className="skeleton h-80 w-full mb-6 rounded-xl" />
        <div className="skeleton h-24 w-full rounded-xl" />
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top App Bar */}
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
        style={{
          background: 'rgba(250, 249, 245, 0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 0.5px 0 rgba(208, 197, 175, 0.25)',
        }}
      >
        <div className="flex items-center gap-3">
          <BackButton href={`/w/${slug}/home`} label="" />
        </div>
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
        <div className="w-8" /> {/* spacer for centering */}
      </header>

      {/* Main Content */}
      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1 flex flex-col">
        {/* Header Section */}
        <section className="mb-8 text-center">
          <div
            className="inline-block uppercase tracking-[0.25em] text-[10px] mb-3"
            style={{ color: 'var(--color-terracotta)', fontWeight: 600 }}
          >
            A little gift for them
          </div>
          <h2
            className="text-5xl mb-3 tracking-tight"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            Leave a Toast
          </h2>
          <div className="flex items-center justify-center gap-3">
            <span
              className="h-px w-8"
              style={{ background: 'var(--border-light)' }}
            />
            <p
              className="text-lg"
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                color: 'var(--color-terracotta)',
              }}
            >
              Your words — they&rsquo;ll keep them
            </p>
            <span
              className="h-px w-8"
              style={{ background: 'var(--border-light)' }}
            />
          </div>
        </section>

        {/* Hero: Video Toast */}
        <section className="mb-6">
          <Link
            href={`/w/${slug}/video?mode=toast`}
            className="block w-full group relative overflow-hidden rounded-3xl transition-all duration-500 hover:-translate-y-1"
            style={{
              background:
                'linear-gradient(145deg, rgba(196, 112, 75, 0.96) 0%, rgba(157, 66, 43, 0.96) 55%, rgba(168, 136, 63, 0.94) 100%)',
              boxShadow:
                '0 24px 60px -18px rgba(157, 66, 43, 0.45), 0 2px 6px rgba(27, 28, 26, 0.05)',
              textDecoration: 'none',
              color: 'white',
            }}
          >
            {/* subtle shimmer overlay */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(circle at 20% 15%, rgba(255,255,255,0.18), transparent 45%), radial-gradient(circle at 85% 85%, rgba(255,255,255,0.10), transparent 55%)',
              }}
            />
            <div className="relative p-8 md:p-10 flex flex-col">
              {/* Top: label + play icon */}
              <div className="flex items-start justify-between mb-6">
                <span
                  className="uppercase tracking-[0.22em] text-[10px] px-3 py-1 rounded-full"
                  style={{
                    background: 'rgba(255,255,255,0.18)',
                    color: 'rgba(255,255,255,0.95)',
                    fontWeight: 600,
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                  }}
                >
                  Video Toast
                </span>
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center"
                  style={{
                    background: 'rgba(255,255,255,0.18)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="none">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>

              {/* Headline */}
              <h3
                className="text-3xl md:text-4xl leading-tight mb-4"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                }}
              >
                Say a few words. They&rsquo;ll replay it for years.
              </h3>

              {/* Sample prompt, quoted */}
              <div
                className="mb-6 p-5 rounded-2xl"
                style={{
                  background: 'rgba(255,255,255,0.10)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                <div
                  className="uppercase tracking-[0.22em] text-[10px] mb-2"
                  style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}
                >
                  Try this one
                </div>
                <p
                  className="text-xl leading-snug"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    color: 'white',
                  }}
                >
                  &ldquo;{samplePrompt}&rdquo;
                </p>
              </div>

              {/* Value props */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 mb-6 text-sm" style={{ color: 'rgba(255,255,255,0.88)' }}>
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  90 seconds, tops
                </span>
                <span className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                  Makes the highlight reel
                </span>
              </div>

              {/* CTA row */}
              <div
                className="flex items-center justify-between pt-5"
                style={{ borderTop: '1px solid rgba(255,255,255,0.16)' }}
              >
                <span
                  className="text-sm font-semibold tracking-[0.18em] uppercase"
                  style={{ color: 'white' }}
                >
                  Start toasting
                </span>
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1"
                  style={{ background: 'rgba(255,255,255,0.22)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </div>
          </Link>
        </section>

        {/* Secondary: Free-form video (understated) */}
        <Link
          href={`/w/${slug}/video?mode=free`}
          className="block w-full group rounded-2xl transition-all duration-300 hover:-translate-y-0.5"
          style={{
            background: 'var(--bg-pure-white)',
            border: '1px solid var(--border-light)',
            textDecoration: 'none',
            padding: '18px 20px',
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'rgba(122, 139, 92, 0.10)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-olive)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className="text-base mb-0.5"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
              >
                Or just say whatever&rsquo;s on your mind
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Skip the prompt — record whatever you want
              </p>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-tertiary)"
              strokeWidth="1.8"
              strokeLinecap="round"
              className="flex-shrink-0 transition-transform duration-300 group-hover:translate-x-1"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </Link>

        {/* Photo booth coming soon note */}
        <div
          className="mt-5 flex items-start gap-3 rounded-xl"
          style={{
            background: 'rgba(168, 136, 63, 0.06)',
            border: '1px dashed rgba(168, 136, 63, 0.28)',
            padding: '12px 16px',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-gold-dark)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, marginTop: 1 }}
          >
            <path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              className="text-[13px] font-semibold mb-0.5"
              style={{ color: 'var(--color-gold-dark)', fontFamily: 'var(--font-body)' }}
            >
              Photo booth opens on the big day
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              AI portraits and instant photos show up at the wedding — pop back in then.
            </p>
          </div>
        </div>

        {/* Gallery Link */}
        <div className="mt-auto pt-14 text-center">
          <Link
            href={`/w/${slug}/gallery`}
            className="inline-flex flex-col items-center gap-3 group"
            style={{ textDecoration: 'none' }}
          >
            <span
              className="h-px w-16 transition-all duration-500 group-hover:w-24"
              style={{ background: 'var(--border-light)' }}
            />
            <span
              className="text-xl group-hover:opacity-80 transition-colors"
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                color: 'var(--text-primary)',
              }}
            >
              View Gallery
            </span>
            <p
              className="uppercase tracking-[0.2em] text-[10px]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Peek at what others left
            </p>
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
