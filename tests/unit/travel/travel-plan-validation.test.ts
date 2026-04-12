import { describe, it, expect } from 'vitest';
import { travelPlanSchema } from '@/lib/validation';

describe('travelPlanSchema', () => {
  const validDirectPlan = {
    plan_type: 'direct' as const,
    origin_city: 'Chicago, IL',
    origin_country: 'USA',
    share_transport: true,
    share_contact: '+1 555-123-4567',
    visibility: 'full' as const,
    stops: [
      {
        stop_type: 'arrival' as const,
        city: 'Barcelona',
        country: 'Spain',
        latitude: 41.39,
        longitude: 2.17,
        arrive_date: '2026-09-07',
      },
    ],
  };

  it('accepts a valid direct travel plan', () => {
    const result = travelPlanSchema.safeParse(validDirectPlan);
    expect(result.success).toBe(true);
  });

  it('accepts a valid exploring travel plan with multiple stops', () => {
    const result = travelPlanSchema.safeParse({
      plan_type: 'exploring',
      origin_city: 'London',
      origin_country: 'UK',
      visibility: 'full',
      stops: [
        {
          stop_type: 'pre_wedding',
          city: 'Paris',
          country: 'France',
          latitude: 48.86,
          longitude: 2.35,
          arrive_date: '2026-09-03',
          depart_date: '2026-09-06',
          open_to_meetup: true,
        },
        {
          stop_type: 'arrival',
          city: 'Barcelona',
          country: 'Spain',
          latitude: 41.39,
          longitude: 2.17,
          arrive_date: '2026-09-07',
        },
        {
          stop_type: 'departure',
          city: 'Barcelona',
          country: 'Spain',
          latitude: 41.39,
          longitude: 2.17,
          depart_date: '2026-09-12',
        },
        {
          stop_type: 'post_wedding',
          city: 'Amalfi',
          country: 'Italy',
          latitude: 40.63,
          longitude: 14.6,
          arrive_date: '2026-09-12',
          depart_date: '2026-09-16',
          open_to_meetup: true,
          notes: 'Renting a car!',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects plan with no stops', () => {
    const result = travelPlanSchema.safeParse({
      plan_type: 'direct',
      stops: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects plan with invalid plan_type', () => {
    const result = travelPlanSchema.safeParse({
      ...validDirectPlan,
      plan_type: 'road_trip',
    });
    expect(result.success).toBe(false);
  });

  it('rejects stop with invalid stop_type', () => {
    const result = travelPlanSchema.safeParse({
      ...validDirectPlan,
      stops: [{ ...validDirectPlan.stops[0], stop_type: 'layover' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid date format', () => {
    const result = travelPlanSchema.safeParse({
      ...validDirectPlan,
      stops: [{ ...validDirectPlan.stops[0], arrive_date: '09/07/2026' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects latitude out of range', () => {
    const result = travelPlanSchema.safeParse({
      ...validDirectPlan,
      stops: [{ ...validDirectPlan.stops[0], latitude: 100 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects longitude out of range', () => {
    const result = travelPlanSchema.safeParse({
      ...validDirectPlan,
      stops: [{ ...validDirectPlan.stops[0], longitude: 200 }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts all visibility levels', () => {
    for (const visibility of ['full', 'city_only', 'private'] as const) {
      const result = travelPlanSchema.safeParse({ ...validDirectPlan, visibility });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid visibility', () => {
    const result = travelPlanSchema.safeParse({
      ...validDirectPlan,
      visibility: 'hidden',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all transport modes', () => {
    for (const transport_mode of ['flight', 'train', 'car', 'bus', 'ferry'] as const) {
      const result = travelPlanSchema.safeParse({
        ...validDirectPlan,
        stops: [{ ...validDirectPlan.stops[0], transport_mode }],
      });
      expect(result.success).toBe(true);
    }
  });

  it('defaults open_to_meetup to true', () => {
    const result = travelPlanSchema.safeParse(validDirectPlan);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stops[0].open_to_meetup).toBe(true);
    }
  });

  it('defaults visibility to full', () => {
    const { visibility: _, ...planNoVis } = validDirectPlan; void _;
    const result = travelPlanSchema.safeParse(planNoVis);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe('full');
    }
  });

  it('rejects share_transport without share_contact', () => {
    const result = travelPlanSchema.safeParse({
      ...validDirectPlan,
      share_transport: true,
      share_contact: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('accepts share_transport=false without share_contact', () => {
    const result = travelPlanSchema.safeParse({
      ...validDirectPlan,
      share_transport: false,
      share_contact: undefined,
    });
    expect(result.success).toBe(true);
  });

  it('accepts depart_time on stops', () => {
    const result = travelPlanSchema.safeParse({
      ...validDirectPlan,
      stops: [{ ...validDirectPlan.stops[0], depart_time: '16:30' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid depart_time format', () => {
    const result = travelPlanSchema.safeParse({
      ...validDirectPlan,
      stops: [{ ...validDirectPlan.stops[0], depart_time: '4:30 PM' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 20 stops', () => {
    const stops = Array.from({ length: 21 }, (_, i) => ({
      stop_type: 'pre_wedding' as const,
      city: `City ${i}`,
      country: 'Country',
      latitude: 0,
      longitude: 0,
    }));
    const result = travelPlanSchema.safeParse({ ...validDirectPlan, stops });
    expect(result.success).toBe(false);
  });
});
