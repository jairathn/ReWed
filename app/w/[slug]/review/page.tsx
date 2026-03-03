'use client';

import BottomNav from '@/components/guest/BottomNav';

export default function ReviewPage() {
  return (
    <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
      <h1
        className="text-2xl font-medium mb-6"
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)',
        }}
      >
        Review
      </h1>
      <p style={{ color: 'var(--text-secondary)' }}>
        Review screen will appear after capturing a photo or video.
      </p>
      <BottomNav />
    </div>
  );
}
