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
  const containerRef = useRef<HTMLDivElement>(null);
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

    // Cancel previous request
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
    // Don't search if user just selected a city
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

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 rounded-lg text-sm border pr-8"
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--text-tertiary)', borderTopColor: 'transparent' }} />
          </div>
        )}
        {selected && !loading && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs"
            style={{ color: '#10b981' }}>
            &#10003;
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div
          className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden"
          style={{
            background: 'var(--bg-pure-white, white)',
            border: '1px solid var(--border-light)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            maxHeight: '240px',
            overflowY: 'auto',
          }}
        >
          {results.map((city) => (
            <button
              key={city.geoname_id}
              type="button"
              onClick={() => handleSelect(city)}
              className="w-full px-3 py-2.5 text-left hover:bg-[#f7f3ed] transition-colors flex items-center gap-2"
              style={{ borderBottom: '1px solid var(--border-light)' }}
            >
              <span className="text-base flex-shrink-0">&#127961;</span>
              <div className="min-w-0">
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
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && !loading && (
        <div
          className="absolute z-50 w-full mt-1 rounded-xl px-3 py-3 text-center"
          style={{
            background: 'var(--bg-pure-white, white)',
            border: '1px solid var(--border-light)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            No cities found
          </p>
        </div>
      )}
    </div>
  );
}
