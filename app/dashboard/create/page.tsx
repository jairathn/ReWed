'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CityAutocomplete, { type CityResult } from '@/components/travel/CityAutocomplete';
import { formatLongDate } from '@/lib/utils/date-format';

const GUEST_COUNTS = ['25', '50', '100', '150', '200', '300', '500', '1000+'];
const EVENT_COUNTS = ['1 event', '2-3 events', '4+ events'];

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function estimatePrice(guestCount: string, features: { portraits: boolean; feed: boolean; faq: boolean }): number {
  const guestNum = parseInt(guestCount) || 50;
  let base = 0;
  if (guestNum <= 25) base = 149;
  else if (guestNum <= 50) base = 249;
  else if (guestNum <= 100) base = 349;
  else if (guestNum <= 200) base = 499;
  else if (guestNum <= 300) base = 599;
  else if (guestNum <= 500) base = 699;
  else base = 799;

  if (features.portraits) base += 49;
  if (features.feed) base += 29;
  if (features.faq) base += 19;

  return base;
}

export default function CreateWeddingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Step 0: Basic info
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [weddingDate, setWeddingDate] = useState('');
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'America/New_York'; }
  });

  // Step 0 continued: Venue city
  const [venueCity, setVenueCity] = useState('');
  const [venueCountry, setVenueCountry] = useState('');
  const [venueLat, setVenueLat] = useState(0);
  const [venueLng, setVenueLng] = useState(0);

  // Step 1: Size
  const [guestCount, setGuestCount] = useState('200');
  const [eventCount, setEventCount] = useState('2-3 events');

  // Step 2: Features
  const [portraits, setPortraits] = useState(true);
  const [socialFeed, setSocialFeed] = useState(false);
  const [faqChatbot, setFaqChatbot] = useState(false);

  const price = estimatePrice(guestCount, { portraits, feed: socialFeed, faq: faqChatbot });

  const steps = [
    { id: 'basics', title: 'The Basics' },
    { id: 'size', title: 'How big is the celebration?' },
    { id: 'features', title: 'Choose Your Features' },
    { id: 'review', title: 'Review & Create' },
  ];

  const canProceed = () => {
    if (currentStep === 0) return displayName.length >= 3 && slug.length >= 3;
    return true;
  };

  const handleCreate = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/dashboard/weddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          display_name: displayName,
          wedding_date: weddingDate || undefined,
          timezone,
          venue_city: venueCity || undefined,
          venue_country: venueCountry || undefined,
          venue_lat: venueLat || undefined,
          venue_lng: venueLng || undefined,
          guest_count: guestCount,
          event_count: eventCount,
          features: {
            ai_portraits: portraits,
            social_feed: socialFeed,
            faq_chatbot: faqChatbot,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Failed to create wedding');
        setSubmitting(false);
        return;
      }

      router.push('/dashboard?success=' + encodeURIComponent(`"${displayName}" created! Share the link: /w/${slug}`));
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 pb-32">
      {/* Branding */}
      <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 24, color: 'var(--color-gold-dark)', marginBottom: 16 }}>
        Zari
      </h1>

      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm mb-8"
        style={{ color: 'var(--text-secondary)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to Dashboard
      </Link>

      {/* Progress */}
      <div className="flex gap-1.5 mb-8">
        {steps.map((step, i) => (
          <div
            key={step.id}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{
              background: i <= currentStep ? 'var(--color-gold-dark)' : 'var(--border-medium)',
            }}
          />
        ))}
      </div>

      {/* Step Content */}
      <div className="card p-8 md:p-10" style={{ borderRadius: 20, background: 'var(--bg-pure-white)', border: '1px solid var(--border-light)', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
        <h2
          className="text-2xl font-medium mb-2"
          style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--text-primary)' }}
        >
          {steps[currentStep].title}
        </h2>

        {/* Step 0: Basics */}
        {currentStep === 0 && (
          <div className="mt-6 space-y-6">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Wedding name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (!slugManual) setSlug(generateSlug(e.target.value));
                }}
                placeholder="Sarah & James's Wedding"
                className="w-full px-4 py-3 rounded-xl text-sm"
                style={{
                  background: 'var(--bg-soft-cream)',
                  border: '1.5px solid var(--border-medium)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Guest app URL
              </label>
              <div className="flex items-center gap-0 rounded-xl overflow-hidden" style={{ border: '1.5px solid var(--border-medium)' }}>
                <span
                  className="px-3 py-3 text-sm shrink-0"
                  style={{ background: 'var(--bg-soft-cream)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
                >
                  zari.app/w/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    setSlugManual(true);
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  }}
                  className="flex-1 px-2 py-3 text-sm"
                  style={{
                    background: 'var(--bg-pure-white)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)',
                    outline: 'none',
                    border: 'none',
                  }}
                />
              </div>
              {slug.length > 0 && slug.length < 3 && (
                <p className="text-xs mt-1" style={{ color: 'var(--color-terracotta)' }}>
                  URL must be at least 3 characters
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Wedding date (optional)
              </label>
              <input
                type="date"
                value={weddingDate}
                onChange={(e) => setWeddingDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm"
                style={{
                  background: 'var(--bg-soft-cream)',
                  border: '1.5px solid var(--border-medium)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Wedding city
              </label>
              <CityAutocomplete
                value={venueCity ? `${venueCity}${venueCountry ? ', ' + venueCountry : ''}` : ''}
                onSelect={(city: CityResult) => {
                  setVenueCity(city.city);
                  setVenueCountry(city.country);
                  setVenueLat(city.latitude);
                  setVenueLng(city.longitude);
                }}
                placeholder="Where is the wedding? e.g. Barcelona"
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Used for guest travel planning and coordination.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Wedding timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm"
                style={{
                  background: 'var(--bg-soft-cream)',
                  border: '1.5px solid var(--border-medium)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  outline: 'none',
                }}
              >
                {(() => {
                  const zones = [
                    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
                    'America/Anchorage', 'Pacific/Honolulu', 'America/Phoenix',
                    'America/Toronto', 'America/Vancouver',
                    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid',
                    'Europe/Amsterdam', 'Europe/Zurich', 'Europe/Athens', 'Europe/Istanbul',
                    'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore',
                    'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
                    'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
                    'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Cairo',
                    'America/Mexico_City', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
                  ];
                  if (!zones.includes(timezone)) zones.unshift(timezone);
                  return zones.map((tz) => {
                    try {
                      const label = tz.replace(/_/g, ' ').replace(/\//g, ' / ');
                      const offset = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
                        .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || '';
                      return <option key={tz} value={tz}>{label} ({offset})</option>;
                    } catch {
                      return <option key={tz} value={tz}>{tz}</option>;
                    }
                  });
                })()}
              </select>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Event times will display in this timezone for your guests.
              </p>
            </div>
          </div>
        )}

        {/* Step 1: Size */}
        {currentStep === 1 && (
          <div className="mt-6 space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                How many guests are you expecting?
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {GUEST_COUNTS.map((count) => (
                  <button
                    key={count}
                    onClick={() => setGuestCount(count)}
                    className="p-4 rounded-xl text-center font-medium transition-colors"
                    style={{
                      background: guestCount === count ? 'rgba(198, 163, 85, 0.06)' : 'var(--bg-soft-cream)',
                      color: guestCount === count ? 'var(--color-gold-dark)' : 'var(--text-primary)',
                      border: guestCount === count ? '2px solid var(--color-gold-dark)' : '2px solid transparent',
                    }}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
                More guests means more messages, more perspectives, and an even richer highlight reel for you.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                How many events?
              </label>
              <div className="grid grid-cols-3 gap-3">
                {EVENT_COUNTS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setEventCount(opt)}
                    className="p-4 rounded-xl text-center font-medium transition-colors"
                    style={{
                      background: eventCount === opt ? 'rgba(198, 163, 85, 0.06)' : 'var(--bg-soft-cream)',
                      color: eventCount === opt ? 'var(--color-gold-dark)' : 'var(--text-primary)',
                      border: eventCount === opt ? '2px solid var(--color-gold-dark)' : '2px solid transparent',
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Features */}
        {currentStep === 2 && (
          <div className="mt-6 space-y-4">
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Every package includes unlimited photos, video recording, and a highlight reel. Add more to make it unforgettable.
            </p>
            {[
              { key: 'portraits', label: 'AI Portraits', desc: 'Guests get fun AI-generated portraits in styles like Mughal royalty, anime, and pop art.', price: '+$49', emoji: '🎨', value: portraits, setter: setPortraits },
              { key: 'feed', label: 'Social Feed', desc: 'A private social feed for the wedding where guests can share moments, memories, and well-wishes.', price: '+$29', emoji: '💬', value: socialFeed, setter: setSocialFeed },
              { key: 'faq', label: 'FAQ Chatbot', desc: 'An AI concierge that answers guest questions about the schedule, venue, dress code, and more.', price: '+$19', emoji: '🤖', value: faqChatbot, setter: setFaqChatbot },
            ].map((feat) => (
              <button
                key={feat.key}
                onClick={() => feat.setter(!feat.value)}
                className="w-full p-5 rounded-xl text-left transition-colors flex items-start gap-4"
                style={{
                  background: feat.value ? 'rgba(198, 163, 85, 0.06)' : 'var(--bg-soft-cream)',
                  border: feat.value ? '2px solid var(--color-gold-dark)' : '2px solid transparent',
                }}
              >
                <span className="text-2xl">{feat.emoji}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{feat.label}</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--color-gold-dark)' }}>{feat.price}</span>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{feat.desc}</p>
                </div>
                <div
                  className="w-6 h-6 rounded-full shrink-0 mt-1 flex items-center justify-center"
                  style={{
                    background: feat.value ? 'var(--color-gold-dark)' : 'var(--border-medium)',
                    transition: 'background 0.15s ease',
                  }}
                >
                  {feat.value && <span className="text-white text-xs">&#10003;</span>}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 3: Review */}
        {currentStep === 3 && (
          <div className="mt-6 space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Wedding name</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{displayName}</span>
              </div>
              <div className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Guest app URL</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>/w/{slug}</span>
              </div>
              {weddingDate && (
                <div className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Date</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {formatLongDate(weddingDate, { timezone })}
                  </span>
                </div>
              )}
              {venueCity && (
                <div className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Wedding city</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {venueCity}{venueCountry ? `, ${venueCountry}` : ''}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Guests</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{guestCount}</span>
              </div>
              <div className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Events</span>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{eventCount}</span>
              </div>
              <div className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>AI Portraits</span>
                <span className="text-sm font-medium" style={{ color: portraits ? 'var(--color-olive)' : 'var(--text-tertiary)' }}>
                  {portraits ? 'Included' : 'Not included'}
                </span>
              </div>
              <div className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--border-light)' }}>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Social Feed</span>
                <span className="text-sm font-medium" style={{ color: socialFeed ? 'var(--color-olive)' : 'var(--text-tertiary)' }}>
                  {socialFeed ? 'Included' : 'Not included'}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>FAQ Chatbot</span>
                <span className="text-sm font-medium" style={{ color: faqChatbot ? 'var(--color-olive)' : 'var(--text-tertiary)' }}>
                  {faqChatbot ? 'Included' : 'Not included'}
                </span>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(196, 112, 75, 0.08)', color: 'var(--color-terracotta)' }}>
                {error}
              </div>
            )}

            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Payment will be set up later. Creating the wedding lets you start configuring the guest experience right away.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-10">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            style={{ opacity: currentStep === 0 ? 0.4 : 1, border: '1px solid var(--border-light)', borderRadius: 10, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer', padding: '10px 24px', fontSize: 14, fontFamily: 'var(--font-body)' }}
          >
            Back
          </button>
          {currentStep < steps.length - 1 ? (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!canProceed()}
              style={{ opacity: canProceed() ? 1 : 0.5, background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', fontWeight: 600, fontFamily: 'var(--font-body)', border: 'none', cursor: 'pointer', padding: '10px 24px', fontSize: 14 }}
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={submitting}
              style={{ opacity: submitting ? 0.7 : 1, background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', fontWeight: 600, fontFamily: 'var(--font-body)', border: 'none', cursor: 'pointer', padding: '10px 24px', fontSize: 14 }}
            >
              {submitting ? 'Creating...' : 'Create Wedding'}
            </button>
          )}
        </div>
      </div>

      {/* Running Total */}
      <div
        className="fixed bottom-0 left-0 right-0 py-4 px-6"
        style={{
          background: 'rgba(254, 252, 249, 0.95)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--border-light)',
        }}
      >
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Estimated total
            </p>
            <p className="text-xl font-semibold" style={{ color: 'var(--color-gold-dark)' }}>
              ${price}
            </p>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Transparent pricing. No surprises.
          </p>
        </div>
      </div>
    </div>
  );
}
