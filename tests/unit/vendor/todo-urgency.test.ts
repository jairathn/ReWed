import { describe, it, expect } from 'vitest';
import { urgencyForAge, ageInDays, annotate } from '@/lib/vendor/todo-urgency';

describe('urgencyForAge', () => {
  it('returns fresh below 30 days', () => {
    expect(urgencyForAge(0)).toBe('fresh');
    expect(urgencyForAge(29)).toBe('fresh');
  });

  it('returns yellow at 30-44 days', () => {
    expect(urgencyForAge(30)).toBe('yellow');
    expect(urgencyForAge(44)).toBe('yellow');
  });

  it('returns orange at 45-59 days', () => {
    expect(urgencyForAge(45)).toBe('orange');
    expect(urgencyForAge(59)).toBe('orange');
  });

  it('returns red at 60+ days', () => {
    expect(urgencyForAge(60)).toBe('red');
    expect(urgencyForAge(180)).toBe('red');
  });
});

describe('ageInDays', () => {
  it('returns 0 for now', () => {
    expect(ageInDays(new Date())).toBe(0);
  });

  it('returns whole days for older timestamps', () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(ageInDays(fiveDaysAgo)).toBe(5);
  });

  it('accepts ISO strings', () => {
    const isoTenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(ageInDays(isoTenDaysAgo)).toBe(10);
  });
});

describe('annotate', () => {
  it('attaches age + urgency for open todos', () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const annotated = annotate({ created_at: fortyDaysAgo, status: 'open' });
    expect(annotated.age_days).toBe(40);
    expect(annotated.urgency).toBe('yellow');
  });

  it('forces urgency to fresh when status is completed', () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const annotated = annotate({ created_at: ninetyDaysAgo, status: 'completed' });
    expect(annotated.age_days).toBe(90);
    expect(annotated.urgency).toBe('fresh');
  });
});
