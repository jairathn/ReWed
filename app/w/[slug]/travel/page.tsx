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
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-warm-white)' }}>
        <div className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1">
          <div className="skeleton h-8 w-48 mb-6" />
          <div className="skeleton h-64 w-full rounded-2xl mb-4" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-warm-white)' }}>
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
        style={{
          background: 'rgba(250, 249, 245, 0.90)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div className="flex items-center gap-3">
          <BackButton href={`/w/${slug}/home`} label="" />
        </div>
        <h1
          className="text-2xl tracking-wide"
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            color: 'var(--color-gold-dark)',
          }}
        >
          ReWed
        </h1>
        <div className="w-8" />
      </header>

      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1">
        <section className="mb-8 text-center">
          <h2
            className="text-5xl mb-3 tracking-tight"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            Guest Travel
          </h2>
          <div className="flex items-center justify-center gap-3">
            <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
            <p
              className="text-lg"
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                color: 'var(--color-terracotta)',
              }}
            >
              Find nearby matches
            </p>
            <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
          </div>
        </section>

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

      </main>

      <BottomNav />
    </div>
  );
}
