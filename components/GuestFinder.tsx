'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface WeddingResult {
  slug: string;
  display_name: string;
  wedding_date: string | null;
}

export default function GuestFinder() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WeddingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const searchWeddings = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setNoResults(false);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/v1/weddings/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const weddings = data.data?.weddings || [];
      setResults(weddings);
      setNoResults(weddings.length === 0);
    } catch {
      setResults([]);
      setNoResults(false);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchWeddings(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, searchWeddings]);

  // Close results when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setResults([]);
        setNoResults(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (wedding: WeddingResult) => {
    router.push(`/w/${wedding.slug}`);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    // Handle both "YYYY-MM-DD" and full ISO strings; strip any time portion
    // so the date is interpreted in local time (no UTC shift).
    const dateOnly = dateStr.split('T')[0];
    const d = new Date(dateOnly + 'T12:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="w-full max-w-sm mx-auto" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          placeholder="Search by couple name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-shadow focus:shadow-md"
          style={{
            background: 'var(--bg-pure-white)',
            border: '1px solid var(--border-medium)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
          }}
          autoComplete="off"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 skeleton rounded-full" />
          </div>
        )}

        {/* Autocomplete results */}
        {results.length > 0 && (
          <div
            className="absolute left-0 right-0 mt-1 rounded-xl overflow-hidden z-10"
            style={{
              background: 'var(--bg-pure-white)',
              border: '1px solid var(--border-light)',
              boxShadow: 'var(--shadow-medium)',
            }}
          >
            {results.map((wedding) => (
              <button
                key={wedding.slug}
                onClick={() => handleSelect(wedding)}
                className="w-full px-4 py-3 text-left hover:bg-[#F7F3ED] transition-colors flex items-center gap-3"
                style={{ borderBottom: '1px solid var(--border-light)' }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                  style={{
                    background: 'var(--color-terracotta-light)',
                    color: 'var(--color-terracotta-dark)',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {wedding.display_name}
                  </p>
                  {wedding.wedding_date && (
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {formatDate(wedding.wedding_date)}
                    </p>
                  )}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* No results */}
      {noResults && query.length >= 2 && !searching && (
        <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-secondary)' }}>
          No weddings found. Check the spelling or try a different name.
        </p>
      )}

      {/* Couple login link */}
      <p className="text-xs mt-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
        Are you a couple?{' '}
        <Link
          href="/dashboard"
          className="underline hover:no-underline"
          style={{ color: 'var(--color-terracotta)' }}
        >
          Log in to your dashboard
        </Link>
      </p>
    </div>
  );
}
