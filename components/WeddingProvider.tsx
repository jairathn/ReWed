'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { WeddingConfig, GuestProfile } from '@/lib/types/api';

interface WeddingContextType {
  config: WeddingConfig | null;
  guest: GuestProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setGuest: (guest: GuestProfile) => void;
  slug: string;
}

const WeddingContext = createContext<WeddingContextType>({
  config: null,
  guest: null,
  isLoading: true,
  isAuthenticated: false,
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

  useEffect(() => {
    if (!config) {
      fetch(`/api/v1/w/${slug}/config`)
        .then((res) => res.json())
        .then((data) => {
          if (data.data) {
            setConfig(data.data);
          }
        })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [slug, config]);

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
        setGuest: handleSetGuest,
        slug,
      }}
    >
      {children}
    </WeddingContext.Provider>
  );
}
