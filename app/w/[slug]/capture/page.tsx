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
      <div className="pb-24 px-7 pt-8 max-w-lg mx-auto">
        <div className="skeleton h-8 w-48 mb-6" />
        <div className="skeleton h-48 w-full mb-4 rounded-2xl" />
        <div className="skeleton h-48 w-full rounded-2xl" />
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="pb-24 px-7 pt-8 max-w-lg mx-auto">
      <BackButton href={`/w/${slug}/home`} label="Home" />

      <h1
        className="text-[32px] font-normal mb-1"
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
        }}
      >
        Capture
      </h1>
      <p
        className="text-sm mb-1"
        style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}
      >
        Share a moment from {config.display_name}
      </p>

      {/* Gold divider */}
      <div
        style={{
          height: 1,
          margin: '16px 0 28px',
          background: 'linear-gradient(90deg, rgba(198,163,85,0) 0%, rgba(198,163,85,0.3) 20%, rgba(212,183,106,0.6) 50%, rgba(198,163,85,0.3) 80%, rgba(198,163,85,0) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s ease-in-out infinite',
        }}
      />

      <div className="space-y-4">
        {/* Photo Booth Card */}
        <Link
          href={`/w/${slug}/photo`}
          className="block overflow-hidden"
          style={{
            borderRadius: 16,
            border: '0.5px solid rgba(198,163,85,0.25)',
            background: 'rgba(198,163,85,0.08)',
            textDecoration: 'none',
          }}
        >
          <div className="px-6 py-7 flex items-center gap-5">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(145deg, #A8883F, #C6A355, #D4B76A)',
                boxShadow: '0 4px 16px rgba(198,163,85,0.25)',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FDFBF7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2
                className="text-lg font-normal mb-1"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--text-primary)',
                }}
              >
                Photo Booth
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Take photos &amp; AI portraits
              </p>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A8883F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </div>
        </Link>

        {/* Video Message Card */}
        <Link
          href={`/w/${slug}/video`}
          className="block overflow-hidden"
          style={{
            borderRadius: 16,
            border: '0.5px solid rgba(198,163,85,0.25)',
            background: 'rgba(198,163,85,0.08)',
            textDecoration: 'none',
          }}
        >
          <div className="px-6 py-7 flex items-center gap-5">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: 'linear-gradient(145deg, #A8883F, #C6A355, #D4B76A)',
                boxShadow: '0 4px 16px rgba(198,163,85,0.25)',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FDFBF7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2
                className="text-lg font-normal mb-1"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--text-primary)',
                }}
              >
                Video Message
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Record a heartfelt message
              </p>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A8883F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </div>
        </Link>

        {/* View Gallery Link */}
        <Link
          href={`/w/${slug}/gallery`}
          className="flex items-center gap-3 py-4 px-1"
          style={{ textDecoration: 'none' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C6A355" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            View Gallery
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A8883F" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </Link>
      </div>

      <BottomNav />
    </div>
  );
}
