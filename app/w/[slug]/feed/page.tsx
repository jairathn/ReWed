'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';

export default function FeedPage() {
  const { guest, isLoading } = useWedding();

  if (isLoading) {
    return (
      <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
        <div className="skeleton h-8 w-32 mb-6" />
        <div className="skeleton h-24 w-full mb-3 rounded-xl" />
        <div className="skeleton h-24 w-full mb-3 rounded-xl" />
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
      <h1
        className="text-2xl font-medium mb-6"
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)',
        }}
      >
        Feed
      </h1>
      <div className="text-center py-16">
        <p className="text-5xl mb-4">&#128172;</p>
        <p
          className="text-lg font-medium mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)',
          }}
        >
          No posts yet
        </p>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Be the first to share a moment!
        </p>
      </div>
      <BottomNav />
    </div>
  );
}
