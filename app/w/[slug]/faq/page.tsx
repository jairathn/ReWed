'use client';

import BottomNav from '@/components/guest/BottomNav';

export default function FaqPage() {
  return (
    <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
      <h1
        className="text-2xl font-medium mb-6"
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)',
        }}
      >
        Questions?
      </h1>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        Ask anything about the wedding and get an instant answer.
      </p>
      <div className="flex flex-wrap gap-2 mb-6">
        {['What\'s the dress code?', 'Where do I park?', 'Is there a plus one?'].map((q) => (
          <button
            key={q}
            className="px-4 py-2 rounded-full text-sm"
            style={{
              background: 'rgba(196, 112, 75, 0.08)',
              color: 'var(--color-terracotta)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {q}
          </button>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
