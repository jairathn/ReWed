'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface CityResult {
  geoname_id: number;
  city: string;
  region: string | null;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  population: number;
}

interface CityAutocompleteProps {
  value: string;
  onSelect: (city: CityResult) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Pre-selected city data (for prefilled fields) */
  initialCity?: CityResult | null;
}

export default function CityAutocomplete({
  value,
  onSelect,
  placeholder = 'Search for a city...',
  disabled = false,
  initialCity,
}: CityAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CityResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CityResult | null>(initialCity || null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync external value changes
  useEffect(() => {
    if (value !== query && !isOpen) {
      setQuery(value);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/cities/search?q=${encodeURIComponent(q)}`,
        { signal: controller.signal }
      );
      const data = await res.json();
      if (data.data?.cities) {
        setResults(data.data.cities);
        setHighlightIndex(-1);
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('City search failed:', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected && query === formatCity(selected)) return;

    const timer = setTimeout(() => {
      if (query.length >= 2) {
        search(query);
        setIsOpen(true);
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, search, selected]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function formatCity(city: CityResult): string {
    const parts = [city.city];
    if (city.region) parts.push(city.region);
    parts.push(city.country);
    return parts.join(', ');
  }

  function handleSelect(city: CityResult) {
    setSelected(city);
    setQuery(formatCity(city));
    setIsOpen(false);
    setResults([]);
    onSelect(city);
  }

  function handleInputChange(val: string) {
    setQuery(val);
    if (selected) {
      setSelected(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(results[highlightIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        {/* Search icon */}
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary, #a0a0a0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-10 pr-10 py-3 rounded-xl text-sm"
          style={{
            border: selected
              ? '1.5px solid var(--color-olive, #7a8b5c)'
              : '1px solid var(--border-light, #e5e5e5)',
            color: 'var(--text-primary)',
            background: 'var(--bg-soft-cream, #faf8f5)',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            outline: 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s',
          }}
          autoComplete="off"
        />
        {/* Right indicator */}
        {loading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <div
              className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }}
            />
          </div>
        )}
        {selected && !loading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-olive, #7a8b5c)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
        {!selected && !loading && query.length > 0 && (
          <button
            onClick={() => { setQuery(''); setResults([]); setIsOpen(false); inputRef.current?.focus(); }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary, #a0a0a0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div
          className="absolute z-50 w-full mt-2 rounded-xl overflow-hidden"
          style={{
            background: 'var(--bg-pure-white, white)',
            border: '1px solid var(--border-light)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)',
            maxHeight: '280px',
            overflowY: 'auto',
          }}
        >
          {results.map((city, idx) => (
            <button
              key={city.geoname_id}
              type="button"
              onClick={() => handleSelect(city)}
              onMouseEnter={() => setHighlightIndex(idx)}
              className="w-full px-4 py-3 text-left transition-colors flex items-center gap-3"
              style={{
                borderBottom: idx < results.length - 1 ? '1px solid var(--border-light)' : 'none',
                background: highlightIndex === idx ? 'var(--bg-soft-cream, #faf8f5)' : 'transparent',
              }}
            >
              <div
                className="flex-shrink-0 flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'rgba(196, 112, 75, 0.08)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta, #c4704b)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {city.city}
                  {city.region && (
                    <span className="font-normal" style={{ color: 'var(--text-secondary)' }}>
                      , {city.region}
                    </span>
                  )}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {city.country}
                  {city.population > 100000 && (
                    <span> &middot; {(city.population / 1000000).toFixed(city.population > 1000000 ? 1 : 2)}M</span>
                  )}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && !loading && (
        <div
          className="absolute z-50 w-full mt-2 rounded-xl px-4 py-4 text-center"
          style={{
            background: 'var(--bg-pure-white, white)',
            border: '1px solid var(--border-light)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
          }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No cities found for &ldquo;{query}&rdquo;
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Try a different spelling or a nearby major city
          </p>
        </div>
      )}
    </div>
  );
}
