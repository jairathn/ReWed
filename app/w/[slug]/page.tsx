'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWedding } from '@/components/WeddingProvider';

export default function GuestRegistrationPage() {
  const { config, slug, isLoading, isAuthenticated, setGuest } = useWedding();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    { id: string; first_name: string; last_name: string }[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

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
        return;
      }

      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/v1/w/${slug}/guests/search?q=${encodeURIComponent(query)}`
        );
        const data = await res.json();
        if (data.data?.guests) {
          setSearchResults(data.data.guests);
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
    try {
      const res = await fetch(`/api/v1/w/${slug}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_id: guest.id }),
      });

      const data = await res.json();
      if (data.data?.guest) {
        setGuest(data.data.guest);
        router.push(`/w/${slug}/home`);
      }
    } catch (err) {
      console.error('Registration failed:', err);
    } finally {
      setIsRegistering(false);
    }
  };

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
        {/* Wedding Name */}
        <h1
          className="text-3xl md:text-4xl font-medium mb-2"
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
            {new Date(config.wedding_date).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        )}

        {config?.hashtag && (
          <p
            className="text-sm mb-8"
            style={{ color: 'var(--color-terracotta)' }}
          >
            {config.hashtag}
          </p>
        )}

        {/* Search Input */}
        <div className="relative mb-4">
          <input
            type="text"
            placeholder="Find your name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div
            className="rounded-2xl overflow-hidden mb-4"
            style={{
              background: 'var(--bg-pure-white)',
              border: '1px solid var(--border-light)',
              boxShadow: 'var(--shadow-medium)',
            }}
          >
            {searchResults.map((guest) => (
              <button
                key={guest.id}
                onClick={() => handleSelectGuest(guest)}
                disabled={isRegistering}
                className="w-full px-6 py-4 text-left hover:bg-[#F7F3ED] transition-colors flex items-center gap-3 disabled:opacity-50"
                style={{
                  borderBottom: '1px solid var(--border-light)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                  style={{
                    background: 'var(--color-terracotta-light)',
                    color: 'var(--color-terracotta-dark)',
                  }}
                >
                  {guest.first_name[0]}
                  {guest.last_name[0]}
                </div>
                <span style={{ color: 'var(--text-primary)' }}>
                  {guest.first_name} {guest.last_name}
                </span>
              </button>
            ))}
          </div>
        )}

        {searchQuery.length >= 2 &&
          searchResults.length === 0 &&
          !isSearching && (
            <p
              className="text-sm py-4"
              style={{ color: 'var(--text-secondary)' }}
            >
              We couldn&apos;t find that name on the guest list. Try a different
              spelling?
            </p>
          )}

        <p
          className="text-xs mt-6"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Start typing your name to find yourself on the guest list
        </p>
      </div>
    </div>
  );
}
