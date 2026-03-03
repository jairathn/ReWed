'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function PhotoBoothPage() {
  const { config, guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  if (isLoading || !config || !guest) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="skeleton w-20 h-20 rounded-full" />
      </div>
    );
  }

  const filters = config.enabled_filters || ['film-grain', 'golden-hour', 'bw-classic'];

  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{ background: '#1a1a1a' }}
    >
      {/* Camera viewfinder placeholder */}
      <div className="flex-1 flex items-center justify-center relative">
        <div className="text-center text-white/40">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="mx-auto mb-3"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <p className="text-sm">Camera will activate here</p>
          <p className="text-xs mt-1 text-white/30">
            Camera access requires HTTPS in production
          </p>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="absolute top-6 left-0 right-0 flex justify-center">
        <div
          className="inline-flex rounded-full p-1"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <button
            className="px-4 py-2 rounded-full text-sm font-medium text-white"
            style={{ background: 'rgba(255, 255, 255, 0.15)' }}
          >
            Single
          </button>
          <button className="px-4 py-2 rounded-full text-sm font-medium text-white/50">
            Burst
          </button>
          <button className="px-4 py-2 rounded-full text-sm font-medium text-white/50">
            AI Portrait
          </button>
        </div>
      </div>

      {/* Filter Carousel */}
      <div className="absolute bottom-36 left-0 right-0 px-4">
        <div className="flex gap-3 overflow-x-auto pb-2 justify-center">
          {filters.map((filter, i) => (
            <button
              key={filter}
              className="flex flex-col items-center gap-1 flex-shrink-0"
            >
              <div
                className="w-14 h-14 rounded-xl border-2"
                style={{
                  borderColor: i === 0 ? 'var(--color-terracotta)' : 'transparent',
                  background: 'rgba(255, 255, 255, 0.1)',
                }}
              />
              <span className="text-[10px] text-white/60">{filter.replace(/-/g, ' ')}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Shutter Button */}
      <div className="pb-8 pt-4 flex justify-center safe-bottom">
        <button
          className="w-[76px] h-[76px] rounded-full flex items-center justify-center"
          style={{
            background: 'transparent',
            border: '4px solid white',
          }}
          aria-label="Take photo"
        >
          <div
            className="w-[64px] h-[64px] rounded-full"
            style={{ background: 'white' }}
          />
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
