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
      <div className="min-h-screen flex flex-col">
        <div className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1">
          <div className="skeleton h-8 w-48 mb-6" />
          <div className="skeleton h-64 w-full rounded-2xl mb-4" />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
        style={{
          background: 'linear-gradient(to bottom, rgba(250, 249, 245, 0.88) 0%, rgba(250, 249, 245, 0.5) 55%, rgba(250, 249, 245, 0) 100%)',
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
          Zari
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
            Travel
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
              See who&rsquo;s in town
            </p>
            <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
          </div>
        </section>

        {/* Tab bar */}
        <div
          className="flex rounded-2xl p-1.5 mb-6"
          style={{
            background: 'var(--bg-pure-white)',
            border: '1px solid var(--border-light)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          {([
            { id: 'travel' as Tab, label: 'Explore', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z' },
            { id: 'arrivals' as Tab, label: 'Arrivals', icon: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z' },
            { id: 'my-plan' as Tab, label: 'My Plan', icon: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7' },
          ]).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium rounded-xl transition-all duration-200"
                style={{
                  background: isActive
                    ? 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))'
                    : 'transparent',
                  color: isActive ? '#FDFBF7' : 'var(--text-tertiary)',
                  boxShadow: isActive ? '0 2px 8px rgba(198,163,85,0.25)' : 'none',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            );
          })}
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
