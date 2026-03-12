'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import TravelPlanForm from '@/components/travel/TravelPlanForm';
import TravelMapView from '@/components/travel/TravelMapView';
import ArrivalsView from '@/components/travel/ArrivalsView';
import OverlapsCard from '@/components/travel/OverlapsCard';

type Tab = 'map' | 'arrivals' | 'my-plan';

export default function TravelPage() {
  const { slug, config, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('map');
  const [hasPlan, setHasPlan] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  // Check if the guest already has a travel plan
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch(`/api/v1/w/${slug}/travel/my-plan`)
      .then((res) => res.json())
      .then((data) => setHasPlan(!!data.data?.plan))
      .catch(() => setHasPlan(false));
  }, [slug, isAuthenticated]);

  // Extract venue city from the first event's venue_address
  const venueInfo = useMemo(() => {
    if (!config?.events?.length) return { city: '', country: '' };
    // Find first event with a venue address
    const event = config.events.find((e) => e.venue_address || e.venue_name);
    if (!event?.venue_address) return { city: '', country: '' };
    // Try to parse "City, Country" or "Street, City, State, Country" patterns
    const parts = event.venue_address.split(',').map((p) => p.trim());
    if (parts.length >= 2) {
      // Last part is usually country, second-to-last is state/region or city
      const country = parts[parts.length - 1];
      // For addresses like "123 Main St, Barcelona, Spain" → city = Barcelona
      // For "Barcelona, Spain" → city = Barcelona
      const city = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
      return { city, country };
    }
    // Single value — treat as city name
    return { city: parts[0], country: '' };
  }, [config]);

  const handlePlanSaved = useCallback(() => {
    setHasPlan(true);
    setActiveTab('map');
  }, []);

  if (isLoading) {
    return (
      <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
        <div className="skeleton h-8 w-48 mb-6" />
        <div className="skeleton h-64 w-full rounded-2xl mb-4" />
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
      <h1
        className="text-2xl font-medium mb-1"
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)',
        }}
      >
        Travel Map
      </h1>
      <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
        See where everyone is traveling and find overlaps
      </p>

      {/* Tab bar */}
      <div
        className="flex rounded-xl p-1 mb-5"
        style={{ background: 'var(--bg-muted, #f5f3f0)' }}
      >
        {([
          { id: 'map' as Tab, label: 'Map' },
          { id: 'arrivals' as Tab, label: 'Arrivals' },
          { id: 'my-plan' as Tab, label: 'My Plan' },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 py-2 text-sm font-medium rounded-lg transition-colors"
            style={{
              background: activeTab === tab.id ? 'white' : 'transparent',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'map' && (
        <div>
          <TravelMapView slug={slug} />
          {hasPlan && <OverlapsCard slug={slug} />}
          {hasPlan === false && (
            <div
              className="card p-5 text-center mt-4"
              style={{ borderLeft: '3px solid var(--color-terracotta)' }}
            >
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                Share your travel plans so other guests can find you!
              </p>
              <button
                onClick={() => setActiveTab('my-plan')}
                className="px-5 py-2.5 rounded-full text-sm font-medium text-white"
                style={{ background: 'var(--color-terracotta-gradient)' }}
              >
                Add My Travel Plans
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'arrivals' && <ArrivalsView slug={slug} />}

      {activeTab === 'my-plan' && (
        <TravelPlanForm
          slug={slug}
          onSaved={handlePlanSaved}
          venueCity={venueInfo.city}
          venueCountry={venueInfo.country}
        />
      )}

      <BottomNav />
    </div>
  );
}
