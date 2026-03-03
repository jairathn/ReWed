'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function VideoRecordingPage() {
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

  const prompts = [
    ...(config.prompts.heartfelt || []),
    ...(config.prompts.fun || []),
    ...(config.prompts.quick_takes || []),
  ];

  const currentPrompt = prompts[0] || 'Share a message for the couple!';

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
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          <p className="text-sm">Camera will activate here</p>
          <p className="text-xs mt-1 text-white/30">
            Camera access requires HTTPS in production
          </p>
        </div>
      </div>

      {/* Floating Prompt Card */}
      <div
        className="absolute top-6 left-4 right-4 glass p-4"
        style={{
          background: 'rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
        }}
      >
        <p
          className="text-white text-center text-lg font-medium"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {currentPrompt}
        </p>
        {prompts.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {prompts.slice(0, 5).map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: i === 0 ? 'white' : 'rgba(255,255,255,0.3)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Mode Toggle */}
      <div className="absolute bottom-36 left-0 right-0 flex justify-center">
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
            Send a Message
          </button>
          <button className="px-4 py-2 rounded-full text-sm font-medium text-white/50">
            Just Record
          </button>
        </div>
      </div>

      {/* Record Button */}
      <div className="pb-8 pt-4 flex justify-center safe-bottom">
        <button
          className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{
            background: 'transparent',
            border: '4px solid white',
          }}
          aria-label="Record video"
        >
          <div
            className="w-16 h-16 rounded-full"
            style={{ background: '#E53E3E' }}
          />
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
