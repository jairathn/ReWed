'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import type { TravelStopInput } from '@/lib/validation';
import CityAutocomplete, { type CityResult } from './CityAutocomplete';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface TravelPlanFormProps {
  slug: string;
  onSaved: () => void;
  venueCity?: string;
  venueCountry?: string;
}

type PlanType = 'direct' | 'exploring';
type Visibility = 'full' | 'city_only' | 'private';

interface LegData {
  id: string; // unique key for React
  city: string;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  arrive_date: string;
  depart_date: string;
  arrive_time: string;
  depart_time: string;
  transport_mode: string;
  transport_details: string;
  open_to_meetup: boolean;
  notes: string;
  isWedding: boolean; // locked wedding destination
}

function createLeg(overrides: Partial<LegData> = {}): LegData {
  return {
    id: Math.random().toString(36).slice(2, 9),
    city: '', country: '', country_code: '', latitude: 0, longitude: 0,
    arrive_date: '', depart_date: '', arrive_time: '', depart_time: '',
    transport_mode: '', transport_details: '',
    open_to_meetup: true, notes: '',
    isWedding: false,
    ...overrides,
  };
}

function createWeddingLeg(city: string, country: string, lat = 0, lng = 0): LegData {
  return createLeg({
    city, country, latitude: lat, longitude: lng,
    isWedding: true,
  });
}

/** Check if date B is before date A */
function isBefore(dateA: string, dateB: string): boolean {
  if (!dateA || !dateB) return false;
  return dateB < dateA;
}

/** Gap in hours between two dates */
function gapHours(depart: string, arrive: string): number | null {
  if (!depart || !arrive) return null;
  const ms = new Date(arrive).getTime() - new Date(depart).getTime();
  return ms / (1000 * 60 * 60);
}

interface ValidationIssue {
  legIndex: number;
  type: 'error' | 'warning';
  message: string;
}

interface Companion {
  id: string;
  first_name: string;
  last_name: string;
}

export default function TravelPlanForm({ slug, onSaved, venueCity, venueCountry }: TravelPlanFormProps) {
  const [planType, setPlanType] = useState<PlanType | null>(null);
  const [originCity, setOriginCity] = useState('');
  const [originCountry, setOriginCountry] = useState('');
  const [originLat, setOriginLat] = useState(0);
  const [originLng, setOriginLng] = useState(0);
  const [shareTransport, setShareTransport] = useState(false);
  const [shareContact, setShareContact] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('full');
  const [planNotes, setPlanNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingPlan, setExistingPlan] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Traveling-with companions
  const [currentGuestId, setCurrentGuestId] = useState<string | null>(null);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [companionSearch, setCompanionSearch] = useState('');
  const [companionResults, setCompanionResults] = useState<Companion[]>([]);
  const [companionSearchFocused, setCompanionSearchFocused] = useState(false);

  // Wedding venue coordinates (looked up on mount)
  const [venueLat, setVenueLat] = useState(0);
  const [venueLng, setVenueLng] = useState(0);

  // Legs: ordered list. Wedding leg is auto-inserted.
  const [legs, setLegs] = useState<LegData[]>(() => [
    createWeddingLeg(venueCity || '', venueCountry || ''),
  ]);

  // Look up venue coordinates on mount
  useEffect(() => {
    if (!venueCity || venueCity.length < 2) return;
    fetch(`/api/v1/cities/search?q=${encodeURIComponent(venueCity)}`)
      .then((res) => res.json())
      .then((data) => {
        const cities: CityResult[] = data.data?.cities || [];
        // Find best match
        const match = cities.find(
          (c) => c.city.toLowerCase() === venueCity.toLowerCase()
        ) || cities[0];
        if (match) {
          setVenueLat(match.latitude);
          setVenueLng(match.longitude);
          // Update wedding leg coordinates
          setLegs((prev) =>
            prev.map((leg) =>
              leg.isWedding
                ? { ...leg, latitude: match.latitude, longitude: match.longitude, city: match.city, country: match.country, country_code: match.country_code }
                : leg
            )
          );
        }
      })
      .catch(console.error);
  }, [venueCity]);

  // Load existing plan
  useEffect(() => {
    fetch(`/api/v1/w/${slug}/travel/my-plan`)
      .then((res) => res.json())
      .then((data) => {
        if (data.data?.guest_id) setCurrentGuestId(data.data.guest_id);
        const plan = data.data?.plan;
        if (!plan) return;

        setExistingPlan(true);

        // Load traveling-with companions
        if (plan.traveling_with?.length > 0) {
          setCompanions(
            plan.traveling_with.map((g: { id: string; first_name: string; last_name: string }) => ({
              id: g.id,
              first_name: g.first_name,
              last_name: g.last_name,
            }))
          );
        }
        setPlanType(plan.plan_type);
        setOriginCity(plan.origin_city || '');
        setOriginCountry(plan.origin_country || '');
        setShareTransport(plan.share_transport);
        setShareContact(plan.share_contact || '');
        setVisibility(plan.visibility);
        setPlanNotes(plan.notes || '');

        const stops = plan.stops || [];
        const origin = stops.find((s: { stop_type: string }) => s.stop_type === 'origin');
        const arrival = stops.find((s: { stop_type: string }) => s.stop_type === 'arrival');
        const departure = stops.find((s: { stop_type: string }) => s.stop_type === 'departure');
        const preWedding = stops
          .filter((s: { stop_type: string }) => s.stop_type === 'pre_wedding')
          .sort((a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order || 0) - (b.sort_order || 0));
        const postWedding = stops
          .filter((s: { stop_type: string }) => s.stop_type === 'post_wedding')
          .sort((a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order || 0) - (b.sort_order || 0));

        if (origin) {
          setOriginLat(origin.latitude || 0);
          setOriginLng(origin.longitude || 0);
        }

        // Build legs from existing stops
        const newLegs: LegData[] = [];

        // Pre-wedding legs
        for (const s of preWedding) {
          newLegs.push(createLeg({
            city: s.city, country: s.country, country_code: s.country_code || '',
            latitude: s.latitude || 0, longitude: s.longitude || 0,
            arrive_date: s.arrive_date || '', depart_date: s.depart_date || '',
            open_to_meetup: s.open_to_meetup ?? true, notes: s.notes || '',
          }));
        }

        // Wedding leg
        const wCity = arrival?.city || venueCity || '';
        const wCountry = arrival?.country || venueCountry || '';
        newLegs.push(createWeddingLeg(wCity, wCountry, arrival?.latitude || venueLat, arrival?.longitude || venueLng));
        const wIdx = newLegs.length - 1;
        if (arrival) {
          newLegs[wIdx].arrive_date = arrival.arrive_date || '';
          newLegs[wIdx].arrive_time = arrival.arrive_time || '';
          newLegs[wIdx].transport_mode = arrival.transport_mode || '';
          newLegs[wIdx].transport_details = arrival.transport_details || '';
        }
        if (departure) {
          newLegs[wIdx].depart_date = departure.depart_date || '';
          newLegs[wIdx].depart_time = departure.depart_time || '';
        }

        // Post-wedding legs
        for (const s of postWedding) {
          newLegs.push(createLeg({
            city: s.city, country: s.country, country_code: s.country_code || '',
            latitude: s.latitude || 0, longitude: s.longitude || 0,
            arrive_date: s.arrive_date || '', depart_date: s.depart_date || '',
            open_to_meetup: s.open_to_meetup ?? true, notes: s.notes || '',
          }));
        }

        setLegs(newLegs);
      })
      .catch(console.error);
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced companion search
  useEffect(() => {
    if (companionSearch.trim().length < 2) {
      setCompanionResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      fetch(`/api/v1/w/${slug}/guests/search?q=${encodeURIComponent(companionSearch.trim())}`)
        .then((res) => res.json())
        .then((data) => {
          const guests: Companion[] = data.data?.guests || [];
          const selectedIds = new Set(companions.map((c) => c.id));
          setCompanionResults(
            guests.filter(
              (g) => g.id !== currentGuestId && !selectedIds.has(g.id)
            )
          );
        })
        .catch(console.error);
    }, 250);
    return () => clearTimeout(timeout);
  }, [companionSearch, slug, companions, currentGuestId]);

  function addCompanion(guest: Companion) {
    setCompanions((prev) => [...prev, guest]);
    setCompanionSearch('');
    setCompanionResults([]);
  }

  function removeCompanion(guestId: string) {
    setCompanions((prev) => prev.filter((c) => c.id !== guestId));
  }

  const weddingLegIndex = useMemo(() => legs.findIndex((l) => l.isWedding), [legs]);

  const updateLeg = useCallback((index: number, updates: Partial<LegData>) => {
    setLegs((prev) => prev.map((leg, i) => (i === index ? { ...leg, ...updates } : leg)));
  }, []);

  function addLegBefore() {
    setLegs((prev) => {
      const wi = prev.findIndex((l) => l.isWedding);
      const newLegs = [...prev];
      newLegs.splice(wi, 0, createLeg());
      return newLegs;
    });
  }

  function addLegAfter() {
    setLegs((prev) => {
      const wi = prev.findIndex((l) => l.isWedding);
      const newLegs = [...prev];
      newLegs.splice(wi + 1, 0, createLeg());
      return newLegs;
    });
  }

  function removeLeg(index: number) {
    setLegs((prev) => prev.filter((_, i) => i !== index));
  }

  function handleLegCitySelect(index: number, city: CityResult) {
    updateLeg(index, {
      city: city.city, country: city.country, country_code: city.country_code,
      latitude: city.latitude, longitude: city.longitude,
    });
  }

  function handleOriginSelect(city: CityResult) {
    setOriginCity(city.city);
    setOriginCountry(city.country);
    setOriginLat(city.latitude);
    setOriginLng(city.longitude);
  }

  // Validation
  const validationIssues = useMemo((): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];
    for (let i = 0; i < legs.length - 1; i++) {
      const current = legs[i];
      const next = legs[i + 1];

      // For the wedding leg, use depart_date as end, arrive_date as start
      const currentEnd = current.depart_date;
      const nextStart = next.arrive_date;

      if (currentEnd && nextStart) {
        if (isBefore(currentEnd, nextStart)) {
          issues.push({
            legIndex: i + 1,
            type: 'error',
            message: `This leg starts before your previous leg ends`,
          });
        } else {
          const gap = gapHours(currentEnd, nextStart);
          if (gap !== null && gap > 24) {
            const days = Math.floor(gap / 24);
            issues.push({
              legIndex: i + 1,
              type: 'warning',
              message: `${days} day gap between this leg and the previous one`,
            });
          }
        }
      }
    }
    return issues;
  }, [legs]);

  const hasErrors = validationIssues.some((i) => i.type === 'error');

  async function handleSave() {
    if (!planType) return;
    if (hasErrors) {
      setError('Please fix the date issues before saving');
      return;
    }
    setError(null);
    setSaving(true);

    try {
      const stops: TravelStopInput[] = [];

      // Origin stop
      if (originCity) {
        stops.push({
          stop_type: 'origin',
          city: originCity,
          country: originCountry || 'Unknown',
          latitude: originLat,
          longitude: originLng,
          open_to_meetup: false,
          sort_order: 0,
        });
      }

      let sortOrder = 1;
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];

        if (leg.isWedding) {
          // Arrival at wedding
          if (leg.arrive_date || leg.city) {
            stops.push({
              stop_type: 'arrival',
              city: leg.city || 'Wedding Destination',
              country: leg.country || 'Unknown',
              latitude: leg.latitude || 0,
              longitude: leg.longitude || 0,
              arrive_date: leg.arrive_date || undefined,
              arrive_time: leg.arrive_time || undefined,
              transport_mode: (leg.transport_mode || undefined) as TravelStopInput['transport_mode'],
              transport_details: leg.transport_details || undefined,
              open_to_meetup: true,
              sort_order: 100,
            });
          }
          // Departure from wedding
          if (leg.depart_date || leg.city) {
            stops.push({
              stop_type: 'departure',
              city: leg.city || 'Wedding Destination',
              country: leg.country || 'Unknown',
              latitude: leg.latitude || 0,
              longitude: leg.longitude || 0,
              depart_date: leg.depart_date || undefined,
              depart_time: leg.depart_time || undefined,
              open_to_meetup: false,
              sort_order: 101,
            });
          }
        } else {
          // Regular leg
          if (!leg.city) continue;
          const isPreWedding = i < weddingLegIndex;
          stops.push({
            stop_type: isPreWedding ? 'pre_wedding' : 'post_wedding',
            city: leg.city,
            country: leg.country || 'Unknown',
            latitude: leg.latitude || 0,
            longitude: leg.longitude || 0,
            arrive_date: leg.arrive_date || undefined,
            depart_date: leg.depart_date || undefined,
            open_to_meetup: leg.open_to_meetup,
            notes: leg.notes || undefined,
            sort_order: sortOrder++,
          });
        }
      }

      if (stops.length === 0) {
        setError('Please add at least your wedding arrival dates');
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/v1/w/${slug}/travel/my-plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_type: planType,
          origin_city: originCity || undefined,
          origin_country: originCountry || undefined,
          origin_lat: originLat || undefined,
          origin_lng: originLng || undefined,
          share_transport: shareTransport,
          share_contact: shareTransport ? shareContact : undefined,
          visibility,
          notes: planNotes || undefined,
          traveling_with_guest_ids: companions.length > 0 ? companions.map((c) => c.id) : undefined,
          stops,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setError(result.error?.message || 'Failed to save');
        return;
      }

      onSaved();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function performDelete() {
    setSaving(true);
    try {
      await fetch(`/api/v1/w/${slug}/travel/my-plan`, { method: 'DELETE' });
      setPlanType(null);
      setOriginCity('');
      setOriginCountry('');
      setOriginLat(0);
      setOriginLng(0);
      setShareContact('');
      setLegs([createWeddingLeg(venueCity || '', venueCountry || '', venueLat, venueLng)]);
      setCompanions([]);
      setExistingPlan(false);
    } catch {
      setError('Failed to delete');
    } finally {
      setSaving(false);
      setConfirmDeleteOpen(false);
    }
  }

  // Step 1: Choose plan type
  if (!planType) {
    return (
      <div className="space-y-3">
        <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
          How are you getting to the wedding?
        </p>
        <button
          onClick={() => setPlanType('direct')}
          className="w-full card p-4 text-left"
          style={{ borderLeft: '3px solid var(--color-terracotta)' }}
        >
          <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
            &#9992;&#65039; Flying in &amp; out
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Heading straight to the wedding and back home
          </p>
        </button>
        <button
          onClick={() => setPlanType('exploring')}
          className="w-full card p-4 text-left"
          style={{ borderLeft: '3px solid #3b82f6' }}
        >
          <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
            &#128506;&#65039; Making a trip of it
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Exploring before or after the wedding
          </p>
        </button>
      </div>
    );
  }

  const weddingLeg = legs[weddingLegIndex];

  return (
    <div className="space-y-5">
      {/* Back / plan type */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setPlanType(null)}
          className="text-xs"
          style={{ color: 'var(--text-tertiary)' }}
        >
          &larr; Change type
        </button>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {planType === 'direct' ? '\u2708\uFE0F Flying in & out' : '\uD83D\uDDFA\uFE0F Making a trip of it'}
        </span>
      </div>

      {/* Origin city */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Where are you coming from?
        </label>
        <CityAutocomplete
          value={originCity ? `${originCity}${originCountry ? ', ' + originCountry : ''}` : ''}
          onSelect={handleOriginSelect}
          placeholder="Search your home city..."
        />
      </div>

      {/* Legs timeline */}
      <div className="relative">
        {/* Timeline line */}
        <div
          className="absolute left-4 top-6 bottom-6 w-0.5"
          style={{
            background: 'linear-gradient(180deg, var(--color-terracotta) 0%, var(--color-golden) 50%, var(--color-olive) 100%)',
          }}
        />

        <div className="space-y-3">
          {/* Pre-wedding "add leg" button (exploring only) */}
          {planType === 'exploring' && (
            <div className="relative flex items-center gap-3 pl-8">
              <button
                onClick={addLegBefore}
                className="w-full py-2 text-xs rounded-lg border-2 border-dashed"
                style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
              >
                + Add a stop before the wedding
              </button>
            </div>
          )}

          {legs.map((leg, i) => {
            const issuesForLeg = validationIssues.filter((v) => v.legIndex === i);

            if (leg.isWedding) {
              return (
                <div key={leg.id} className="relative flex gap-3">
                  {/* Timeline dot */}
                  <div className="flex-shrink-0 w-8 flex justify-center pt-4">
                    <div
                      className="w-3.5 h-3.5 rounded-full z-10"
                      style={{
                        background: 'var(--color-terracotta)',
                        boxShadow: '0 0 0 4px rgba(196, 112, 75, 0.2)',
                      }}
                    />
                  </div>

                  <div
                    className="flex-1 card p-4"
                    style={{ borderLeft: '3px solid var(--color-terracotta)' }}
                  >
                    {/* Validation issues */}
                    {issuesForLeg.map((issue, vi) => (
                      <div
                        key={vi}
                        className="text-xs px-2 py-1 rounded mb-2"
                        style={{
                          background: issue.type === 'error' ? '#fee2e2' : '#fef3c7',
                          color: issue.type === 'error' ? '#dc2626' : '#92400e',
                        }}
                      >
                        {issue.message}
                      </div>
                    ))}

                    <p
                      className="text-sm font-medium mb-0.5"
                      style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                    >
                      Wedding Destination
                    </p>
                    <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                      {weddingLeg.city}{weddingLeg.country ? `, ${weddingLeg.country}` : ''}
                    </p>

                    {/* Arrival */}
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Arriving
                    </label>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input
                        type="date"
                        value={leg.arrive_date}
                        onChange={(e) => updateLeg(i, { arrive_date: e.target.value })}
                        className="px-3 py-2 rounded-lg text-sm border"
                        style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                      />
                      <input
                        type="time"
                        value={leg.arrive_time}
                        onChange={(e) => updateLeg(i, { arrive_time: e.target.value })}
                        className="px-3 py-2 rounded-lg text-sm border"
                        style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <select
                        value={leg.transport_mode}
                        onChange={(e) => updateLeg(i, { transport_mode: e.target.value })}
                        className="px-3 py-2 rounded-lg text-sm border"
                        style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                      >
                        <option value="">Transport</option>
                        <option value="flight">Flight</option>
                        <option value="train">Train</option>
                        <option value="car">Car</option>
                        <option value="bus">Bus</option>
                        <option value="ferry">Ferry</option>
                      </select>
                      <input
                        type="text"
                        value={leg.transport_details}
                        onChange={(e) => updateLeg(i, { transport_details: e.target.value })}
                        placeholder="e.g. UA 123"
                        className="px-3 py-2 rounded-lg text-sm border"
                        style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                      />
                    </div>

                    {/* Departure */}
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Departing
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={leg.depart_date}
                        onChange={(e) => updateLeg(i, { depart_date: e.target.value })}
                        className="px-3 py-2 rounded-lg text-sm border"
                        style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                      />
                      <input
                        type="time"
                        value={leg.depart_time}
                        onChange={(e) => updateLeg(i, { depart_time: e.target.value })}
                        className="px-3 py-2 rounded-lg text-sm border"
                        style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                </div>
              );
            }

            // Regular (non-wedding) leg
            return (
              <div key={leg.id} className="relative flex gap-3">
                {/* Timeline dot */}
                <div className="flex-shrink-0 w-8 flex justify-center pt-4">
                  <div
                    className="w-2.5 h-2.5 rounded-full z-10"
                    style={{ background: '#3b82f6' }}
                  />
                </div>

                <div
                  className="flex-1 card p-3"
                  style={{ borderLeft: '3px solid #3b82f6' }}
                >
                  {/* Validation issues */}
                  {issuesForLeg.map((issue, vi) => (
                    <div
                      key={vi}
                      className="text-xs px-2 py-1 rounded mb-2"
                      style={{
                        background: issue.type === 'error' ? '#fee2e2' : '#fef3c7',
                        color: issue.type === 'error' ? '#dc2626' : '#92400e',
                      }}
                    >
                      {issue.message}
                    </div>
                  ))}

                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {i < weddingLegIndex ? 'Pre-wedding stop' : 'Post-wedding stop'}
                    </span>
                    <button
                      onClick={() => removeLeg(i)}
                      className="text-xs px-2 py-0.5"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mb-2">
                    <CityAutocomplete
                      value={leg.city ? `${leg.city}${leg.country ? ', ' + leg.country : ''}` : ''}
                      onSelect={(city) => handleLegCitySelect(i, city)}
                      placeholder="Search for a city..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-[10px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>Arrive</label>
                      <input
                        type="date"
                        value={leg.arrive_date}
                        onChange={(e) => updateLeg(i, { arrive_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg text-sm border"
                        style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>Depart</label>
                      <input
                        type="date"
                        value={leg.depart_date}
                        onChange={(e) => updateLeg(i, { depart_date: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg text-sm border"
                        style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={leg.open_to_meetup}
                      onChange={(e) => updateLeg(i, { open_to_meetup: e.target.checked })}
                    />
                    Open to meeting up here
                  </label>
                  <input
                    type="text"
                    value={leg.notes}
                    onChange={(e) => updateLeg(i, { notes: e.target.value })}
                    placeholder="Notes (optional)"
                    className="w-full px-3 py-2 rounded-lg text-sm border mt-2"
                    style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            );
          })}

          {/* Post-wedding "add leg" button (exploring only) */}
          {planType === 'exploring' && (
            <div className="relative flex items-center gap-3 pl-8">
              <button
                onClick={addLegAfter}
                className="w-full py-2 text-xs rounded-lg border-2 border-dashed"
                style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
              >
                + Add a stop after the wedding
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Traveling with */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: 'linear-gradient(145deg, rgba(198,163,85,0.08) 0%, rgba(196,112,75,0.05) 100%)',
          border: '1px solid rgba(198,163,85,0.18)',
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
          <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Traveling with
          </label>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
          Add partners or friends you&rsquo;re traveling with &mdash; we&rsquo;ll mirror your plan to theirs
        </p>

        {/* Selected companions */}
        {companions.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {companions.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full text-sm"
                style={{
                  background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
                  color: '#FDFBF7',
                  boxShadow: '0 2px 6px rgba(198,163,85,0.25)',
                }}
              >
                {c.first_name} {c.last_name}
                <button
                  type="button"
                  onClick={() => removeCompanion(c.id)}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                  style={{ background: 'rgba(255,255,255,0.25)', color: '#FDFBF7' }}
                  aria-label={`Remove ${c.first_name}`}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={companionSearch}
            onChange={(e) => setCompanionSearch(e.target.value)}
            onFocus={() => setCompanionSearchFocused(true)}
            onBlur={() => setTimeout(() => setCompanionSearchFocused(false), 150)}
            placeholder={companions.length > 0 ? 'Add another guest...' : 'Search guests by name...'}
            className="w-full px-3 py-2 rounded-lg text-sm border"
            style={{
              borderColor: 'var(--border-light)',
              color: 'var(--text-primary)',
              background: 'var(--bg-pure-white)',
            }}
          />
          {companionSearchFocused && companionResults.length > 0 && (
            <div
              className="absolute z-20 left-0 right-0 mt-1 rounded-xl overflow-hidden"
              style={{
                background: 'var(--bg-pure-white)',
                border: '1px solid var(--border-light)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {companionResults.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addCompanion(g)}
                  className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors hover:bg-[var(--bg-warm-white)]"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                    style={{
                      background: 'linear-gradient(145deg, rgba(198,163,85,0.15), rgba(198,163,85,0.08))',
                      color: 'var(--color-gold-dark)',
                    }}
                  >
                    {g.first_name.charAt(0)}
                  </div>
                  {g.first_name} {g.last_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Share transport */}
      <div>
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={shareTransport}
            onChange={(e) => setShareTransport(e.target.checked)}
          />
          I&apos;d share a ride from the airport
        </label>
        {shareTransport && (
          <div className="mt-2 ml-6">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Phone or email (shared with ride matches only)
            </label>
            <input
              type="text"
              value={shareContact}
              onChange={(e) => setShareContact(e.target.value)}
              placeholder="e.g. +1 555-123-4567 or name@email.com"
              className="w-full px-3 py-2 rounded-lg text-sm border"
              style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
            />
          </div>
        )}
      </div>

      {/* Visibility */}
      <div>
        <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
          Who can see your plans?
        </label>
        <div className="space-y-2">
          {([
            { value: 'full' as Visibility, label: 'Full details', desc: 'Dates, notes, transport' },
            { value: 'city_only' as Visibility, label: 'Cities only', desc: 'Just which cities, no dates' },
            { value: 'private' as Visibility, label: 'Private', desc: "Don't show on the map" },
          ]).map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 text-sm cursor-pointer"
              style={{ color: 'var(--text-primary)' }}
            >
              <input
                type="radio"
                name="visibility"
                value={opt.value}
                checked={visibility === opt.value}
                onChange={() => setVisibility(opt.value)}
              />
              <span>
                {opt.label}{' '}
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  ({opt.desc})
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Notes (optional)
        </label>
        <textarea
          value={planNotes}
          onChange={(e) => setPlanNotes(e.target.value)}
          placeholder="e.g. Would love to meet up with anyone!"
          rows={2}
          className="w-full px-3 py-2 rounded-lg text-sm border resize-none"
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
        />
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || hasErrors}
        className="w-full py-3 rounded-full text-sm font-medium text-white disabled:opacity-50"
        style={{ background: 'var(--color-terracotta-gradient)' }}
      >
        {saving ? 'Saving...' : existingPlan ? 'Update Travel Plans' : 'Save My Travel Plans'}
      </button>

      {existingPlan && (
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={saving}
          className="w-full py-2 text-sm"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Delete my travel plan
        </button>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete your travel plan?"
        description="This will remove your travel itinerary from the wedding. Any details you shared with the couple (origin, transport, stops) will be deleted. You can always add a new plan later."
        variant="danger"
        confirmLabel="Delete plan"
        onConfirm={performDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
