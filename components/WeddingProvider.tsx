'use client';

import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import type { WeddingConfig, GuestProfile } from '@/lib/types/api';

interface WeddingContextType {
  config: WeddingConfig | null;
  guest: GuestProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  configError: string | null;
  retryConfig: () => void;
  setGuest: (guest: GuestProfile) => void;
  slug: string;
}

const WeddingContext = createContext<WeddingContextType>({
  config: null,
  guest: null,
  isLoading: true,
  isAuthenticated: false,
  configError: null,
  retryConfig: () => {},
  setGuest: () => {},
  slug: '',
});

export function useWedding() {
  return useContext(WeddingContext);
}

export function WeddingProvider({
  children,
  slug,
  initialConfig,
}: {
  children: ReactNode;
  slug: string;
  initialConfig?: WeddingConfig;
}) {
  const [config, setConfig] = useState<WeddingConfig | null>(initialConfig || null);
  const [guest, setGuest] = useState<GuestProfile | null>(null);
  const [isLoading, setIsLoading] = useState(!initialConfig);
  const [configError, setConfigError] = useState<string | null>(null);
  const retryCount = useRef(0);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setConfigError(null);
    try {
      const res = await fetch(`/api/v1/w/${slug}/config`);
      if (!res.ok) {
        throw new Error(`Config fetch failed (${res.status})`);
      }
      const data = await res.json();
      if (data.data) {
        setConfig(data.data);
        retryCount.current = 0;
        setIsLoading(false);
      } else {
        throw new Error('Invalid config response');
      }
    } catch (err) {
      console.error('Config fetch error:', err);
      // Auto-retry once after a short delay
      if (retryCount.current < 1) {
        retryCount.current += 1;
        setTimeout(() => fetchConfig(), 1500);
        // Keep isLoading true during retry
      } else {
        setConfigError(err instanceof Error ? err.message : 'Failed to load wedding');
        setIsLoading(false);
      }
    }
  }, [slug]);

  const retryConfig = useCallback(() => {
    retryCount.current = 0;
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (!config) {
      fetchConfig();
    }
  }, [slug, config, fetchConfig]);

  // Try to restore guest from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`guest_${slug}`);
    if (stored) {
      try {
        setGuest(JSON.parse(stored));
      } catch {
        localStorage.removeItem(`guest_${slug}`);
      }
    }
  }, [slug]);

  const handleSetGuest = (newGuest: GuestProfile) => {
    setGuest(newGuest);
    localStorage.setItem(`guest_${slug}`, JSON.stringify(newGuest));
  };

  return (
    <WeddingContext.Provider
      value={{
        config,
        guest,
        isLoading,
        isAuthenticated: !!guest,
        configError,
        retryConfig,
        setGuest: handleSetGuest,
        slug,
      }}
    >
      {children}
    </WeddingContext.Provider>
  );
}
