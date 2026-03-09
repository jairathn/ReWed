import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: vi.fn(),
  }),
}));

vi.mock('@/lib/session', () => ({
  validateSession: vi.fn().mockResolvedValue({
    sessionId: 's-001',
    weddingId: 'w-001',
    guestId: 'g-001',
  }),
}));

import { GET as getMyPlan, PUT as putMyPlan, DELETE as deleteMyPlan } from '@/app/api/v1/w/[slug]/travel/my-plan/route';
import { GET as getMap } from '@/app/api/v1/w/[slug]/travel/map/route';
import { GET as getArrivals } from '@/app/api/v1/w/[slug]/travel/arrivals/route';
import { GET as getOverlaps } from '@/app/api/v1/w/[slug]/travel/overlaps/route';

function makeParams(slug = 'neil-shriya') {
  return { params: Promise.resolve({ slug }) };
}

function makeRequest(url: string, options?: RequestInit) {
  return new NextRequest(url, {
    headers: { Cookie: 'wedding_session=valid-token' },
    ...options,
  });
}

describe('Travel API', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  // authenticateTravelRequest calls:
  //   1. pool.query(SELECT id FROM weddings WHERE slug = $1) → wedding lookup
  // validateSession is fully mocked, no pool.query calls

  describe('GET /travel/my-plan', () => {
    it('returns null when no plan exists', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }) // wedding slug
        .mockResolvedValueOnce({ rows: [] }); // no plan

      const request = makeRequest('http://localhost:3000/api/v1/w/neil-shriya/travel/my-plan');
      const response = await getMyPlan(request, makeParams());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.plan).toBeNull();
    });

    it('returns plan with stops when exists', async () => {
      const plan = {
        id: 'tp-001', plan_type: 'direct', origin_city: 'Chicago',
        origin_lat: 41.88, origin_lng: -87.63, origin_country: 'USA',
        share_transport: true, visibility: 'full', notes: null,
        created_at: '2026-01-01', updated_at: '2026-01-01',
      };
      const stops = [{
        id: 'ts-001', stop_type: 'arrival', city: 'Barcelona',
        region: null, country: 'Spain', country_code: 'ES',
        latitude: 41.39, longitude: 2.17,
        arrive_date: '2026-09-07', depart_date: null, arrive_time: '14:30',
        transport_mode: 'flight', transport_details: 'UA 123',
        accommodation: null, open_to_meetup: true, notes: null, sort_order: 0,
      }];

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }) // wedding slug
        .mockResolvedValueOnce({ rows: [plan] }) // plan
        .mockResolvedValueOnce({ rows: stops }); // stops

      const request = makeRequest('http://localhost:3000/api/v1/w/neil-shriya/travel/my-plan');
      const response = await getMyPlan(request, makeParams());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.plan.plan_type).toBe('direct');
      expect(body.data.plan.stops).toHaveLength(1);
      expect(body.data.plan.stops[0].city).toBe('Barcelona');
    });
  });

  describe('PUT /travel/my-plan', () => {
    it('creates a new travel plan', async () => {
      const planResponse = {
        id: 'tp-001', plan_type: 'direct', origin_city: 'Chicago',
        origin_lat: null, origin_lng: null, origin_country: 'USA',
        share_transport: false, visibility: 'full', notes: null,
        created_at: '2026-01-01', updated_at: '2026-01-01',
      };
      const stopResponse = {
        id: 'ts-001', stop_type: 'arrival', city: 'Barcelona',
        region: null, country: 'Spain', country_code: null,
        latitude: 41.39, longitude: 2.17,
        arrive_date: '2026-09-07', depart_date: null, arrive_time: null,
        transport_mode: null, transport_details: null,
        accommodation: null, open_to_meetup: true, notes: null, sort_order: 0,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }) // wedding slug
        .mockResolvedValueOnce({ rows: [planResponse] }) // upsert plan
        .mockResolvedValueOnce({ rows: [] }) // delete old stops
        .mockResolvedValueOnce({ rows: [stopResponse] }); // insert stop

      const request = makeRequest('http://localhost:3000/api/v1/w/neil-shriya/travel/my-plan', {
        method: 'PUT',
        body: JSON.stringify({
          plan_type: 'direct',
          origin_city: 'Chicago',
          origin_country: 'USA',
          stops: [{
            stop_type: 'arrival',
            city: 'Barcelona',
            country: 'Spain',
            latitude: 41.39,
            longitude: 2.17,
            arrive_date: '2026-09-07',
          }],
        }),
      });

      const response = await putMyPlan(request, makeParams());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.plan.plan_type).toBe('direct');
      expect(body.data.plan.stops).toHaveLength(1);
    });

    it('rejects invalid plan body', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }); // wedding slug

      const request = makeRequest('http://localhost:3000/api/v1/w/neil-shriya/travel/my-plan', {
        method: 'PUT',
        body: JSON.stringify({ plan_type: 'invalid', stops: [] }),
      });

      const response = await putMyPlan(request, makeParams());
      expect(response.status).toBe(400);
    });
  });

  describe('GET /travel/map', () => {
    it('returns grouped stops excluding private plans and destination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }) // wedding slug
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'ts-001', city: 'Paris', country: 'France', country_code: 'FR',
              latitude: 48.86, longitude: 2.35, stop_type: 'pre_wedding',
              arrive_date: '2026-09-03', depart_date: '2026-09-06',
              open_to_meetup: true, stop_notes: 'Looking for recs!',
              guest_id: 'g-001', display_name: 'Aditya Sharma', visibility: 'full',
            },
            {
              id: 'ts-002', city: 'Paris', country: 'France', country_code: 'FR',
              latitude: 48.86, longitude: 2.35, stop_type: 'pre_wedding',
              arrive_date: '2026-09-04', depart_date: '2026-09-07',
              open_to_meetup: true, stop_notes: null,
              guest_id: 'g-002', display_name: 'Priya Patel', visibility: 'full',
            },
            {
              id: 'ts-003', city: 'Rome', country: 'Italy', country_code: 'IT',
              latitude: 41.9, longitude: 12.5, stop_type: 'post_wedding',
              arrive_date: null, depart_date: null,
              open_to_meetup: false, stop_notes: null,
              guest_id: 'g-003', display_name: 'Vikram', visibility: 'city_only',
            },
          ],
        });

      const request = makeRequest('http://localhost:3000/api/v1/w/neil-shriya/travel/map');
      const response = await getMap(request, makeParams());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.stops).toHaveLength(2); // Paris + Rome

      const paris = body.data.stops.find((s: { city: string }) => s.city === 'Paris');
      expect(paris.guest_count).toBe(2);
      expect(paris.guests).toHaveLength(2);

      // city_only visibility hides dates
      const rome = body.data.stops.find((s: { city: string }) => s.city === 'Rome');
      expect(rome.guests[0].arrive_date).toBeNull();
      expect(rome.guests[0].notes).toBeNull();
    });

    it('returns empty array when no stops exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }) // wedding slug
        .mockResolvedValueOnce({ rows: [] }); // no stops

      const request = makeRequest('http://localhost:3000/api/v1/w/neil-shriya/travel/map');
      const response = await getMap(request, makeParams());
      const body = await response.json();

      expect(body.data.stops).toHaveLength(0);
    });
  });

  describe('GET /travel/arrivals', () => {
    it('returns arrival and departure info', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }) // wedding slug
        .mockResolvedValueOnce({
          rows: [
            {
              stop_type: 'arrival', arrive_date: '2026-09-07', depart_date: null,
              arrive_time: '14:30', transport_mode: 'flight',
              transport_details: 'UA 123 from ORD',
              guest_id: 'g-001', display_name: 'Aditya Sharma',
              share_transport: true, origin_city: 'Chicago',
            },
          ],
        });

      const request = makeRequest('http://localhost:3000/api/v1/w/neil-shriya/travel/arrivals');
      const response = await getArrivals(request, makeParams());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.arrivals).toHaveLength(1);
      expect(body.data.arrivals[0].display_name).toBe('Aditya Sharma');
      expect(body.data.arrivals[0].share_transport).toBe(true);
    });
  });

  describe('GET /travel/overlaps', () => {
    it('returns overlapping guests in same city', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }) // wedding slug
        .mockResolvedValueOnce({
          rows: [{
            city: 'Paris', country: 'France',
            arrive_date: '2026-09-03', depart_date: '2026-09-06',
          }],
        }) // my stops
        .mockResolvedValueOnce({
          rows: [{
            display_name: 'Priya Patel',
            arrive_date: '2026-09-04', depart_date: '2026-09-07',
            open_to_meetup: true,
          }],
        }); // overlapping guests

      const request = makeRequest('http://localhost:3000/api/v1/w/neil-shriya/travel/overlaps');
      const response = await getOverlaps(request, makeParams());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.overlaps).toHaveLength(1);
      expect(body.data.overlaps[0].city).toBe('Paris');
      expect(body.data.overlaps[0].overlapping_guests[0].display_name).toBe('Priya Patel');
    });

    it('returns empty when no plan exists', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }) // wedding slug
        .mockResolvedValueOnce({ rows: [] }); // no stops

      const request = makeRequest('http://localhost:3000/api/v1/w/neil-shriya/travel/overlaps');
      const response = await getOverlaps(request, makeParams());
      const body = await response.json();

      expect(body.data.overlaps).toHaveLength(0);
    });
  });

  describe('DELETE /travel/my-plan', () => {
    it('deletes the travel plan', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }) // wedding slug
        .mockResolvedValueOnce({ rows: [] }); // delete

      const request = makeRequest('http://localhost:3000/api/v1/w/neil-shriya/travel/my-plan', {
        method: 'DELETE',
      });

      const response = await deleteMyPlan(request, makeParams());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.deleted).toBe(true);
    });
  });
});
