'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function GuestFinder() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = code.trim().toLowerCase().replace(/\s+/g, '-');
    if (!slug) return;

    setError('');
    setChecking(true);

    try {
      const res = await fetch(`/api/v1/w/${encodeURIComponent(slug)}/config`);
      if (res.ok) {
        router.push(`/w/${slug}`);
      } else {
        setError('Wedding not found. Check the code and try again.');
      }
    } catch {
      setError('Could not connect. Please check your connection.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          placeholder="e.g. priya-and-raj"
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(''); }}
          className="flex-1 px-4 py-3 rounded-xl text-sm outline-none transition-shadow focus:shadow-md"
          style={{
            background: 'var(--bg-pure-white)',
            border: '1px solid var(--border-medium)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
          }}
        />
        <button
          type="submit"
          disabled={!code.trim() || checking}
          className="px-5 py-3 rounded-xl text-sm font-medium transition-opacity"
          style={{
            background: code.trim() ? 'var(--color-terracotta-gradient)' : 'var(--border-light)',
            color: code.trim() ? 'white' : 'var(--text-tertiary)',
            border: 'none',
          }}
        >
          {checking ? '...' : 'Go'}
        </button>
      </form>
      {error && (
        <p className="text-xs mt-2 text-center" style={{ color: 'var(--color-terracotta)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
