'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GalleryPage() {
  const { guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  if (isLoading || !guest) {
    return (
      <div className="pb-24 px-5 pt-8">
        <div className="skeleton h-8 w-40 mb-6" />
        <div className="grid grid-cols-3 gap-[3px]">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton aspect-square" />
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
      <h1
        className="text-2xl font-medium mb-2"
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)',
        }}
      >
        My Memories
      </h1>

      {/* Stats Row */}
      <div className="flex gap-4 mb-6">
        {[
          { label: 'Photos', count: 0 },
          { label: 'Videos', count: 0 },
          { label: 'Portraits', count: 0 },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <p
              className="text-lg font-semibold"
              style={{ color: 'var(--color-terracotta)' }}
            >
              {stat.count}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {['All', 'Photos', 'Videos', 'Portraits'].map((tab, i) => (
          <button
            key={tab}
            className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
            style={{
              background: i === 0 ? 'var(--color-terracotta)' : 'transparent',
              color: i === 0 ? 'white' : 'var(--text-secondary)',
              border:
                i === 0
                  ? 'none'
                  : '1px solid var(--border-light)',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Empty State */}
      <div className="text-center py-16">
        <p className="text-5xl mb-4">&#128247;</p>
        <p
          className="text-lg font-medium mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)',
          }}
        >
          No memories yet
        </p>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Take a photo or record a video to start building your gallery!
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
