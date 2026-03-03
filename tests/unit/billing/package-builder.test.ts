import { describe, it, expect } from 'vitest';
import { calculatePackagePrice } from '@/lib/billing/pricing';

describe('Package Builder Pricing', () => {
  it('calculates correct price for mid-size wedding', () => {
    const result = calculatePackagePrice({
      guest_count: 200,
      event_count: 3,
      ai_portraits_per_guest: 5,
      deliverables: 'all_guests',
      social_feed: true,
      faq_chatbot: true,
      sms_notifications: true,
      theme_customization: 'full',
    });

    expect(result.total_cents).toBeGreaterThan(0);
    expect(result.breakdown).toHaveProperty('base');
    expect(result.breakdown).toHaveProperty('portraits');
    expect(result.breakdown).toHaveProperty('deliverables');
    expect(result.our_cost_cents).toBeLessThan(result.total_cents);
    expect(result.total_cents - result.our_cost_cents).toBeGreaterThan(20000);
  });

  it('enforces minimum $200 profit at smallest package', () => {
    const result = calculatePackagePrice({
      guest_count: 25,
      event_count: 1,
      ai_portraits_per_guest: 3,
      deliverables: 'couple_only',
      social_feed: false,
      faq_chatbot: false,
      sms_notifications: false,
      theme_customization: 'preset',
    });

    const profit = result.total_cents - result.our_cost_cents;
    expect(profit).toBeGreaterThanOrEqual(20000);
  });

  it('scales correctly for large wedding', () => {
    const small = calculatePackagePrice({
      guest_count: 50,
      event_count: 1,
      ai_portraits_per_guest: 3,
      deliverables: 'couple_only',
      social_feed: false,
      faq_chatbot: false,
      sms_notifications: false,
      theme_customization: 'preset',
    });

    const large = calculatePackagePrice({
      guest_count: 500,
      event_count: 5,
      ai_portraits_per_guest: 15,
      deliverables: 'all_guests',
      social_feed: true,
      faq_chatbot: true,
      sms_notifications: true,
      theme_customization: 'full',
    });

    expect(large.total_cents).toBeGreaterThan(small.total_cents);
    expect(large.our_cost_cents).toBeGreaterThan(small.our_cost_cents);
  });

  it('includes all breakdown components', () => {
    const result = calculatePackagePrice({
      guest_count: 100,
      event_count: 2,
      ai_portraits_per_guest: 5,
      deliverables: 'all_guests',
      social_feed: true,
      faq_chatbot: true,
      sms_notifications: true,
      theme_customization: 'full',
    });

    expect(result.breakdown.base).toBeGreaterThan(0);
    expect(result.breakdown.portraits).toBeGreaterThan(0);
    expect(result.breakdown.deliverables).toBeGreaterThan(0);
    expect(result.breakdown.social_feed).toBe(25_00);
    expect(result.breakdown.faq_chatbot).toBe(25_00);
    expect(result.breakdown.sms).toBeGreaterThan(0);
    expect(result.breakdown.theme).toBe(39_00);
  });
});
