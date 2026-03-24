'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function CapturePage() {
  const { config, guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  if (isLoading || !config || !guest) {
    return (
      <div className="pb-24 px-6 pt-24 max-w-2xl mx-auto">
        <div className="skeleton h-12 w-48 mx-auto mb-4" />
        <div className="skeleton h-5 w-64 mx-auto mb-12" />
        <div className="skeleton h-64 w-full mb-6 rounded-xl" />
        <div className="skeleton h-64 w-full rounded-xl" />
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-warm-white)' }}>
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
        <section className="mb-10 text-center">
          <h2
            className="text-5xl mb-3 tracking-tight"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            Capture
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
              Share a moment from {config.display_name}
            </p>
            <span
              className="h-px w-8"
              style={{ background: 'var(--border-light)' }}
            />
          </div>
        </section>

        {/* Capture Options */}
        <div className="space-y-7">
          {/* Photo Booth Card */}
          <Link
            href={`/w/${slug}/photo`}
            className="block w-full group relative overflow-hidden rounded-xl transition-all duration-500 hover:-translate-y-1"
            style={{
              background: 'var(--bg-pure-white)',
              boxShadow: '0 32px 64px -12px rgba(27, 28, 26, 0.06)',
              textDecoration: 'none',
            }}
          >
            <div className="flex flex-col md:flex-row">
              {/* Image Left */}
              <div className="w-full md:w-2/5 h-48 md:h-64 relative overflow-hidden">
                <div
                  className="w-full h-full transition-transform duration-700 group-hover:scale-105"
                  style={{
                    background: 'linear-gradient(145deg, rgba(168,136,63,0.1), rgba(212,175,55,0.15))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
                    <path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                </div>
                <div
                  className="absolute inset-0"
                  style={{ background: 'rgba(168, 136, 63, 0.05)', mixBlendMode: 'overlay' }}
                />
              </div>

              {/* Text Right */}
              <div className="w-full md:w-3/5 p-7 text-left flex flex-col justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                <h3
                  className="text-2xl mb-2"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: 'var(--text-primary)',
                  }}
                >
                  Photo Booth
                </h3>
                <p className="leading-relaxed" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                  Take photos &amp; AI portraits
                </p>
                <div
                  className="mt-5 flex items-center text-sm font-semibold tracking-widest uppercase"
                  style={{ color: 'var(--color-gold-dark)' }}
                >
                  Open Camera
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="ml-2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Video Message Card */}
          <Link
            href={`/w/${slug}/video`}
            className="block w-full group relative overflow-hidden rounded-xl transition-all duration-500 hover:-translate-y-1"
            style={{
              background: 'var(--bg-pure-white)',
              boxShadow: '0 32px 64px -12px rgba(27, 28, 26, 0.06)',
              textDecoration: 'none',
            }}
          >
            <div className="flex flex-col md:flex-row-reverse">
              {/* Image Right */}
              <div className="w-full md:w-2/5 h-48 md:h-64 relative overflow-hidden">
                <div
                  className="w-full h-full transition-transform duration-700 group-hover:scale-105"
                  style={{
                    background: 'linear-gradient(145deg, rgba(157,66,43,0.08), rgba(232,134,90,0.12))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta-light)" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                </div>
                <div
                  className="absolute inset-0"
                  style={{ background: 'rgba(157, 66, 43, 0.05)', mixBlendMode: 'overlay' }}
                />
              </div>

              {/* Text Left */}
              <div className="w-full md:w-3/5 p-7 text-left flex flex-col justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                <h3
                  className="text-2xl mb-2"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: 'var(--text-primary)',
                  }}
                >
                  Video Message
                </h3>
                <p className="leading-relaxed" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                  Record a heartfelt message
                </p>
                <div
                  className="mt-5 flex items-center text-sm font-semibold tracking-widest uppercase"
                  style={{ color: 'var(--color-terracotta)' }}
                >
                  Start Recording
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="ml-2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
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
              See what others shared
            </p>
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
