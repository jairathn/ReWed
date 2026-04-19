'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWedding } from '@/components/WeddingProvider';

export default function GuestRegistrationPage() {
  const { config, slug, isLoading, isAuthenticated, configError, retryConfig, setGuest } = useWedding();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    { id: string; first_name: string; last_name: string }[]
  >([]);
  const [matchType, setMatchType] = useState<'exact' | 'unique_first' | 'fuzzy' | 'none' | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // If already authenticated, redirect to home
  useEffect(() => {
    if (isAuthenticated) {
      router.replace(`/w/${slug}/home`);
    }
  }, [isAuthenticated, router, slug]);

  // Debounced search
  const searchGuests = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setSearchResults([]);
        setMatchType(null);
        return;
      }

      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/v1/w/${slug}/guests/search?q=${encodeURIComponent(query)}`
        );
        const data = await res.json();
        if (data.data) {
          setSearchResults(data.data.guests || []);
          setMatchType(data.data.match_type || 'none');
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      searchGuests(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchGuests]);

  const handleSelectGuest = async (guest: {
    id: string;
    first_name: string;
    last_name: string;
  }) => {
    setIsRegistering(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/w/${slug}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_id: guest.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Something went wrong. Please try again.');
        return;
      }
      if (data.data?.guest) {
        setGuest(data.data.guest);
        router.push(`/w/${slug}/home`);
      } else {
        setError('Could not sign you in. Please try again.');
      }
    } catch (err) {
      console.error('Registration failed:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsRegistering(false);
    }
  };

  if (configError && !isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Couldn&apos;t load the wedding. Check your connection and try again.
          </p>
          <button
            onClick={retryConfig}
            className="px-6 py-2.5 rounded-full text-sm font-medium text-white"
            style={{ background: 'var(--color-terracotta-gradient)' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="skeleton h-10 w-3/4 mx-auto mb-4" />
          <div className="skeleton h-6 w-1/2 mx-auto mb-8" />
          <div className="skeleton h-14 w-full mb-4 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{ background: 'var(--bg-warm-gradient)' }}
    >
      <div className="w-full max-w-md text-center">
        {/* Zari Branding */}
        <p
          className="text-2xl tracking-wide mb-8"
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            color: 'var(--color-gold-dark)',
          }}
        >
          Zari
        </p>

        {/* Wedding Name */}
        <h1
          className="text-5xl tracking-tight mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)',
          }}
        >
          {config?.display_name || 'Welcome'}
        </h1>

        {config?.wedding_date && (
          <p
            className="text-sm mb-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {new Date(config.wedding_date + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: config.timezone || 'America/New_York',
            })}
          </p>
        )}

        {config?.hashtag && (
          <p
            className="text-sm mb-1"
            style={{ color: 'var(--color-terracotta)' }}
          >
            {config.hashtag}
          </p>
        )}

        {/* Decorative Line */}
        <div className="flex items-center justify-center gap-3 mb-8 mt-4">
          <div
            className="h-px w-12"
            style={{ background: 'var(--border-medium)' }}
          />
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--color-gold)' }}
          />
          <div
            className="h-px w-12"
            style={{ background: 'var(--border-medium)' }}
          />
        </div>

        {/* Search Input */}
        <div className="relative mb-4">
          <input
            type="text"
            placeholder="Find your name..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (hasSubmitted) setHasSubmitted(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (searchResults.length === 1 && (matchType === 'exact' || matchType === 'unique_first')) {
                  handleSelectGuest(searchResults[0]);
                } else {
                  setHasSubmitted(true);
                }
              }
            }}
            className="w-full px-6 py-4 rounded-2xl text-lg outline-none transition-shadow focus:shadow-md"
            style={{
              background: 'var(--bg-pure-white)',
              border: '1px solid var(--border-medium)',
              fontFamily: 'var(--font-body)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-soft)',
            }}
            autoFocus
            autoComplete="off"
          />
          {isSearching && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 skeleton rounded-full" />
            </div>
          )}
        </div>

        {/* Match-type label above results */}
        {searchResults.length > 0 && matchType === 'fuzzy' && (
          <p
            className="text-[11px] uppercase tracking-widest mb-2"
            style={{ color: 'var(--text-tertiary)', letterSpacing: '0.15em' }}
          >
            Did you mean?
          </p>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div
            className="rounded-2xl overflow-hidden mb-4"
            style={{
              background: 'var(--bg-pure-white)',
              border: matchType === 'exact'
                ? '1px solid var(--color-gold-rule)'
                : '1px solid var(--border-light)',
              boxShadow: matchType === 'exact'
                ? '0 8px 24px rgba(198, 163, 85, 0.15)'
                : 'var(--shadow-medium)',
            }}
          >
            {searchResults.map((guest, idx) => (
              <button
                key={guest.id}
                onClick={() => handleSelectGuest(guest)}
                disabled={isRegistering}
                className="w-full px-6 py-4 text-left hover:bg-[#F7F3ED] transition-colors flex items-center gap-3 disabled:opacity-50"
                style={{
                  borderBottom: idx < searchResults.length - 1 ? '1px solid var(--border-light)' : 'none',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                  style={{
                    background: matchType === 'exact'
                      ? 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))'
                      : 'var(--color-terracotta-light)',
                    color: matchType === 'exact' ? '#FDFBF7' : 'var(--color-terracotta-dark)',
                  }}
                >
                  {guest.first_name[0]}
                  {guest.last_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block" style={{ color: 'var(--text-primary)' }}>
                    {guest.first_name} {guest.last_name}
                  </span>
                  {matchType === 'exact' && (
                    <span
                      className="text-[11px] uppercase tracking-widest"
                      style={{ color: 'var(--color-gold-dark)', letterSpacing: '0.12em' }}
                    >
                      Continue as you
                    </span>
                  )}
                  {matchType === 'unique_first' && (
                    <span
                      className="text-xs"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Is this you?
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {error && (
          <div
            className="p-3 rounded-xl text-sm mb-4"
            style={{
              background: 'rgba(196, 112, 75, 0.08)',
              color: 'var(--color-terracotta)',
            }}
          >
            {error}
          </div>
        )}

        {hasSubmitted &&
          searchQuery.length >= 2 &&
          matchType === 'none' &&
          !isSearching && (
            <p
              className="text-sm py-4"
              style={{ color: 'var(--text-secondary)' }}
            >
              We couldn&apos;t find that name on the guest list. Try your full
              name as it appears on the invitation?
            </p>
          )}

        <p
          className="text-xs mt-6"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Enter your full name as it appears on the invitation
        </p>
      </div>
    </div>
  );
}
