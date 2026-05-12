'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { usePreviewMode } from '@/lib/hooks/usePreviewMode';

/**
 * Couple-only preview gate. Lives at /w/[slug]/preview so real guests
 * never see it. Once unlocked, /home renders the extra preview-only
 * cards (Gallery, etc.). Unlock persists in localStorage.
 */
export default function PreviewGatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { unlocked, tryUnlock, lock } = usePreviewMode();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  // Already unlocked? Bounce straight to home.
  useEffect(() => {
    if (unlocked) router.replace(`/w/${slug}/home`);
  }, [unlocked, router, slug]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'var(--bg-warm-white)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-7"
        style={{
          background: 'var(--bg-pure-white)',
          border: '1px solid var(--border-light)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.08)',
        }}
      >
        <p
          className="text-center mb-1"
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 14,
            color: 'var(--color-gold-dark)',
            letterSpacing: '0.04em',
          }}
        >
          Zari
        </p>
        <h1
          className="text-center mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            color: 'var(--text-primary)',
          }}
        >
          Preview mode
        </h1>
        <p
          className="text-center mb-6"
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.55,
          }}
        >
          Enter the preview password to see the guest experience as it&apos;ll
          appear to invited guests.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (tryUnlock(password)) {
              router.replace(`/w/${slug}/home`);
            } else {
              setError(true);
            }
          }}
        >
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
            placeholder="Password"
            autoFocus
            style={{
              width: '100%',
              padding: '11px 14px',
              borderRadius: 10,
              border: `1.5px solid ${error ? '#ef4444' : 'var(--border-medium)'}`,
              background: 'var(--bg-pure-white)',
              fontSize: 14,
              fontFamily: 'var(--font-body)',
              color: 'var(--text-primary)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <p className="text-xs mt-1.5" style={{ color: '#ef4444' }}>
              Incorrect password
            </p>
          )}
          <button
            type="submit"
            className="w-full mt-4 text-xs font-medium uppercase tracking-wide"
            style={{
              padding: '11px 0',
              background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
              color: 'var(--bg-warm-white)',
              border: 'none',
              borderRadius: 999,
              cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            Unlock preview
          </button>
        </form>

        {unlocked && (
          <button
            onClick={() => {
              lock();
            }}
            className="w-full mt-3 text-xs"
            style={{
              padding: '8px 0',
              background: 'transparent',
              color: 'var(--text-tertiary)',
              border: 'none',
              fontFamily: 'var(--font-body)',
              cursor: 'pointer',
            }}
          >
            Currently unlocked · click to re-lock
          </button>
        )}
      </div>
    </div>
  );
}
