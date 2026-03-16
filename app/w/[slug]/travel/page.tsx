'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import TravelPlanForm from '@/components/travel/TravelPlanForm';
import TravelListView from '@/components/travel/TravelListView';
import ArrivalsView from '@/components/travel/ArrivalsView';

type Tab = 'travel' | 'arrivals' | 'my-plan';

export default function TravelPage() {
  const { slug, config, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('travel');
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

  // Get venue city from wedding config (set during registration)
  const venueInfo = useMemo(() => {
    if (config?.venue_city) {
      return { city: config.venue_city, country: config.venue_country || '' };
    }
    // Fallback: try parsing from first event's venue_address
    if (!config?.events?.length) return { city: '', country: '' };
    const event = config.events.find((e) => e.venue_address || e.venue_name);
    if (!event?.venue_address) return { city: '', country: '' };
    const parts = event.venue_address.split(',').map((p) => p.trim());
    if (parts.length >= 2) {
      const country = parts[parts.length - 1];
      const city = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
      return { city, country };
    }
    return { city: parts[0], country: '' };
  }, [config]);

  const handlePlanSaved = useCallback(() => {
    setHasPlan(true);
    setActiveTab('travel');
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
      <BackButton href={`/w/${slug}/home`} label="Home" />
      <h1
        className="text-2xl font-medium mb-1"
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)',
        }}
      >
        Guest Travel
      </h1>
      <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
        See where everyone is headed and find nearby matches
      </p>

      {/* Tab bar */}
      <div
        className="flex rounded-xl p-1 mb-5"
        style={{ background: 'var(--bg-muted, #f5f3f0)' }}
      >
        {([
          { id: 'travel' as Tab, label: 'Travel' },
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
      {activeTab === 'travel' && (
        <TravelListView
          slug={slug}
          hasPlan={hasPlan}
          onAddPlan={() => setActiveTab('my-plan')}
        />
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
