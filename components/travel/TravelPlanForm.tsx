'use client';

import { useEffect, useState } from 'react';
import type { TravelStopInput } from '@/lib/validation';
import CityAutocomplete, { type CityResult } from './CityAutocomplete';

interface TravelPlanFormProps {
  slug: string;
  onSaved: () => void;
  /** Venue info from the first wedding event, used to prefill arrival */
  venueCity?: string;
  venueCountry?: string;
}

type PlanType = 'direct' | 'exploring';
type Visibility = 'full' | 'city_only' | 'private';

interface StopFormData {
  stop_type: string;
  city: string;
  country: string;
  country_code: string;
  latitude: number;
  longitude: number;
  arrive_date: string;
  depart_date: string;
  arrive_time: string;
  transport_mode: string;
  transport_details: string;
  accommodation: string;
  open_to_meetup: boolean;
  notes: string;
}

function emptyStop(stop_type: string): StopFormData {
  return {
    stop_type,
    city: '', country: '', country_code: '', latitude: 0, longitude: 0,
    arrive_date: '', depart_date: '', arrive_time: '',
    transport_mode: '', transport_details: '', accommodation: '',
    open_to_meetup: true, notes: '',
  };
}

function applyCityResult(stop: StopFormData, city: CityResult): StopFormData {
  return {
    ...stop,
    city: city.city,
    country: city.country,
    country_code: city.country_code,
    latitude: city.latitude,
    longitude: city.longitude,
  };
}

/** Build display string for a stop's city (for the autocomplete input value) */
function stopCityDisplay(stop: StopFormData): string {
  if (!stop.city) return '';
  const parts = [stop.city];
  if (stop.country) parts.push(stop.country);
  return parts.join(', ');
}

export default function TravelPlanForm({ slug, onSaved, venueCity, venueCountry }: TravelPlanFormProps) {
  const [planType, setPlanType] = useState<PlanType | null>(null);
  const [originCity, setOriginCity] = useState('');
  const [originCountry, setOriginCountry] = useState('');
  const [originLat, setOriginLat] = useState(0);
  const [originLng, setOriginLng] = useState(0);
  const [shareTransport, setShareTransport] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('full');
  const [planNotes, setPlanNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingPlan, setExistingPlan] = useState<boolean>(false);

  // Stops
  const [arrivalStop, setArrivalStop] = useState<StopFormData>(() => {
    // Prefill arrival with venue data from wedding config
    const stop = emptyStop('arrival');
    if (venueCity) stop.city = venueCity;
    if (venueCountry) stop.country = venueCountry;
    return stop;
  });
  const [departureStop, setDepartureStop] = useState<StopFormData>(() => {
    const stop = emptyStop('departure');
    if (venueCity) stop.city = venueCity;
    if (venueCountry) stop.country = venueCountry;
    return stop;
  });
  const [extraStops, setExtraStops] = useState<StopFormData[]>([]);

  // Load existing plan (overrides prefill)
  useEffect(() => {
    fetch(`/api/v1/w/${slug}/travel/my-plan`)
      .then((res) => res.json())
      .then((data) => {
        const plan = data.data?.plan;
        if (!plan) return;

        setExistingPlan(true);
        setPlanType(plan.plan_type);
        setOriginCity(plan.origin_city || '');
        setOriginCountry(plan.origin_country || '');
        setShareTransport(plan.share_transport);
        setVisibility(plan.visibility);
        setPlanNotes(plan.notes || '');

        const stops = plan.stops || [];
        const arrival = stops.find((s: StopFormData) => s.stop_type === 'arrival');
        const departure = stops.find((s: StopFormData) => s.stop_type === 'departure');
        const origin = stops.find((s: StopFormData) => s.stop_type === 'origin');
        const extras = stops.filter(
          (s: StopFormData) => !['arrival', 'departure', 'origin'].includes(s.stop_type)
        );

        if (origin) {
          setOriginLat(origin.latitude || 0);
          setOriginLng(origin.longitude || 0);
        }
        if (arrival) setArrivalStop({ ...emptyStop('arrival'), ...arrival });
        if (departure) setDepartureStop({ ...emptyStop('departure'), ...departure });
        if (extras.length > 0) setExtraStops(extras.map((s: StopFormData) => ({ ...emptyStop(s.stop_type), ...s })));
      })
      .catch(console.error);
  }, [slug]);

  function addExtraStop() {
    setExtraStops([...extraStops, emptyStop('pre_wedding')]);
  }

  function removeExtraStop(index: number) {
    setExtraStops(extraStops.filter((_, i) => i !== index));
  }

  function updateExtraStop(index: number, updates: Partial<StopFormData>) {
    setExtraStops(extraStops.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  }

  function handleOriginSelect(city: CityResult) {
    setOriginCity(city.city);
    setOriginCountry(city.country);
    setOriginLat(city.latitude);
    setOriginLng(city.longitude);
  }

  function handleArrivalCitySelect(city: CityResult) {
    setArrivalStop((prev) => applyCityResult(prev, city));
    // Also update departure city to match if it hasn't been explicitly set
    setDepartureStop((prev) => {
      if (!prev.city || prev.city === venueCity) {
        return applyCityResult(prev, city);
      }
      return prev;
    });
  }

  function handleExtraStopCitySelect(index: number, city: CityResult) {
    updateExtraStop(index, {
      city: city.city,
      country: city.country,
      country_code: city.country_code,
      latitude: city.latitude,
      longitude: city.longitude,
    });
  }

  async function handleSave() {
    if (!planType) return;
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

      // Extra stops (for exploring type)
      if (planType === 'exploring') {
        for (let i = 0; i < extraStops.length; i++) {
          const s = extraStops[i];
          if (!s.city) continue;
          stops.push({
            stop_type: s.stop_type as TravelStopInput['stop_type'],
            city: s.city,
            country: s.country || 'Unknown',
            latitude: s.latitude || 0,
            longitude: s.longitude || 0,
            arrive_date: s.arrive_date || undefined,
            depart_date: s.depart_date || undefined,
            transport_mode: (s.transport_mode || undefined) as TravelStopInput['transport_mode'],
            transport_details: s.transport_details || undefined,
            accommodation: s.accommodation || undefined,
            open_to_meetup: s.open_to_meetup,
            notes: s.notes || undefined,
            sort_order: i + 1,
          });
        }
      }

      // Arrival at wedding destination
      if (arrivalStop.arrive_date || arrivalStop.city) {
        stops.push({
          stop_type: 'arrival',
          city: arrivalStop.city || 'Wedding Destination',
          country: arrivalStop.country || 'Unknown',
          latitude: arrivalStop.latitude || 0,
          longitude: arrivalStop.longitude || 0,
          arrive_date: arrivalStop.arrive_date || undefined,
          arrive_time: arrivalStop.arrive_time || undefined,
          transport_mode: (arrivalStop.transport_mode || undefined) as TravelStopInput['transport_mode'],
          transport_details: arrivalStop.transport_details || undefined,
          open_to_meetup: true,
          sort_order: 100,
        });
      }

      // Departure
      if (departureStop.depart_date || departureStop.city) {
        stops.push({
          stop_type: 'departure',
          city: departureStop.city || arrivalStop.city || 'Wedding Destination',
          country: departureStop.country || arrivalStop.country || 'Unknown',
          latitude: departureStop.latitude || arrivalStop.latitude || 0,
          longitude: departureStop.longitude || arrivalStop.longitude || 0,
          depart_date: departureStop.depart_date || undefined,
          open_to_meetup: false,
          sort_order: 101,
        });
      }

      if (stops.length === 0) {
        setError('Please add at least one stop');
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
          visibility,
          notes: planNotes || undefined,
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

  async function handleDelete() {
    if (!confirm('Delete your travel plan?')) return;
    setSaving(true);
    try {
      await fetch(`/api/v1/w/${slug}/travel/my-plan`, { method: 'DELETE' });
      setPlanType(null);
      setOriginCity('');
      setOriginCountry('');
      setOriginLat(0);
      setOriginLng(0);
      setExtraStops([]);
      setArrivalStop(() => {
        const stop = emptyStop('arrival');
        if (venueCity) stop.city = venueCity;
        if (venueCountry) stop.country = venueCountry;
        return stop;
      });
      setDepartureStop(() => {
        const stop = emptyStop('departure');
        if (venueCity) stop.city = venueCity;
        if (venueCountry) stop.country = venueCountry;
        return stop;
      });
      setExistingPlan(false);
    } catch {
      setError('Failed to delete');
    } finally {
      setSaving(false);
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
          {planType === 'direct' ? '✈️ Flying in & out' : '🗺️ Making a trip of it'}
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

      {/* Extra stops (exploring only) */}
      {planType === 'exploring' && (
        <div>
          <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            Your stops
          </label>
          {extraStops.map((stop, i) => (
            <div key={i} className="card p-3 mb-3" style={{ borderLeft: '3px solid #3b82f6' }}>
              <div className="flex items-center justify-between mb-2">
                <select
                  value={stop.stop_type}
                  onChange={(e) => updateExtraStop(i, { stop_type: e.target.value })}
                  className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                >
                  <option value="pre_wedding">Pre-wedding stop</option>
                  <option value="post_wedding">Post-wedding stop</option>
                </select>
                <button
                  onClick={() => removeExtraStop(i)}
                  className="text-xs px-2 py-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Remove
                </button>
              </div>
              <div className="mb-2">
                <CityAutocomplete
                  value={stopCityDisplay(stop)}
                  onSelect={(city) => handleExtraStopCitySelect(i, city)}
                  placeholder="Search for a city..."
                />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  type="date"
                  value={stop.arrive_date}
                  onChange={(e) => updateExtraStop(i, { arrive_date: e.target.value })}
                  className="px-3 py-2 rounded-lg text-sm border"
                  style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                />
                <input
                  type="date"
                  value={stop.depart_date}
                  onChange={(e) => updateExtraStop(i, { depart_date: e.target.value })}
                  className="px-3 py-2 rounded-lg text-sm border"
                  style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
                />
              </div>
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={stop.open_to_meetup}
                  onChange={(e) => updateExtraStop(i, { open_to_meetup: e.target.checked })}
                />
                Open to meeting up here
              </label>
              <input
                type="text"
                value={stop.notes}
                onChange={(e) => updateExtraStop(i, { notes: e.target.value })}
                placeholder="Notes (optional)"
                className="w-full px-3 py-2 rounded-lg text-sm border mt-2"
                style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
              />
            </div>
          ))}
          <button
            onClick={addExtraStop}
            className="w-full py-2 text-sm rounded-lg border-2 border-dashed"
            style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)' }}
          >
            + Add a stop
          </button>
        </div>
      )}

      {/* Arrival at wedding */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Arriving at wedding destination
        </label>
        <div className="mb-2">
          <CityAutocomplete
            value={stopCityDisplay(arrivalStop)}
            onSelect={handleArrivalCitySelect}
            placeholder="Search wedding destination city..."
          />
        </div>
        {arrivalStop.city && (
          <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
            &#128205; {arrivalStop.city}{arrivalStop.country ? `, ${arrivalStop.country}` : ''}
            {arrivalStop.latitude ? ` (${arrivalStop.latitude.toFixed(2)}, ${arrivalStop.longitude.toFixed(2)})` : ''}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input
            type="date"
            value={arrivalStop.arrive_date}
            onChange={(e) => setArrivalStop({ ...arrivalStop, arrive_date: e.target.value })}
            className="px-3 py-2 rounded-lg text-sm border"
            style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
          />
          <input
            type="time"
            value={arrivalStop.arrive_time}
            onChange={(e) => setArrivalStop({ ...arrivalStop, arrive_time: e.target.value })}
            className="px-3 py-2 rounded-lg text-sm border"
            style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select
            value={arrivalStop.transport_mode}
            onChange={(e) => setArrivalStop({ ...arrivalStop, transport_mode: e.target.value })}
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
            value={arrivalStop.transport_details}
            onChange={(e) => setArrivalStop({ ...arrivalStop, transport_details: e.target.value })}
            placeholder="e.g. UA 123"
            className="px-3 py-2 rounded-lg text-sm border"
            style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Departure */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          Departing wedding destination
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={departureStop.depart_date}
            onChange={(e) => setDepartureStop({ ...departureStop, depart_date: e.target.value })}
            className="px-3 py-2 rounded-lg text-sm border"
            style={{ borderColor: 'var(--border-light)', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Share transport */}
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        <input
          type="checkbox"
          checked={shareTransport}
          onChange={(e) => setShareTransport(e.target.checked)}
        />
        I&apos;d share a ride from the airport
      </label>

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
        disabled={saving}
        className="w-full py-3 rounded-full text-sm font-medium text-white disabled:opacity-50"
        style={{ background: 'var(--color-terracotta-gradient)' }}
      >
        {saving ? 'Saving...' : existingPlan ? 'Update Travel Plans' : 'Save My Travel Plans'}
      </button>

      {existingPlan && (
        <button
          onClick={handleDelete}
          disabled={saving}
          className="w-full py-2 text-sm"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Delete my travel plan
        </button>
      )}
    </div>
  );
}
