import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: vi.fn(),
  }),
}));

import { GET } from '@/app/api/v1/w/[slug]/guests/search/route';

function makeRequest(slug: string, q: string) {
  return new NextRequest(
    `http://localhost:3000/api/v1/w/${slug}/guests/search?q=${encodeURIComponent(q)}`
  );
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const SAMPLE_GUESTS = [
  { id: 'g-001', first_name: 'Aditya', last_name: 'Sharma' },
  { id: 'g-002', first_name: 'Aditi', last_name: 'Gupta' },
  { id: 'g-003', first_name: 'Priya', last_name: 'Patel' },
  { id: 'g-004', first_name: 'Vikram', last_name: 'Singh' },
];

describe('GET /api/v1/w/[slug]/guests/search', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns an exact match (case-insensitive) with match_type=exact', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] })
      .mockResolvedValueOnce({ rows: SAMPLE_GUESTS });

    const response = await GET(
      makeRequest('test-wedding', 'aditya sharma'),
      makeParams('test-wedding')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.match_type).toBe('exact');
    expect(body.data.guests).toHaveLength(1);
    expect(body.data.guests[0].first_name).toBe('Aditya');
  });

  it('returns unique_first match for a single first-name query', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] })
      .mockResolvedValueOnce({ rows: SAMPLE_GUESTS });

    const response = await GET(
      makeRequest('test-wedding', 'priya'),
      makeParams('test-wedding')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.match_type).toBe('unique_first');
    expect(body.data.guests).toHaveLength(1);
    expect(body.data.guests[0].first_name).toBe('Priya');
  });

  it('returns fuzzy matches when off by ≤2 letters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] })
      .mockResolvedValueOnce({ rows: SAMPLE_GUESTS });

    const response = await GET(
      makeRequest('test-wedding', 'aditya sharmaa'),
      makeParams('test-wedding')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.match_type).toBe('fuzzy');
    expect(body.data.guests.length).toBeGreaterThan(0);
  });

  it('returns match_type=none when nothing matches', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] })
      .mockResolvedValueOnce({ rows: SAMPLE_GUESTS });

    const response = await GET(
      makeRequest('test-wedding', 'nobody here'),
      makeParams('test-wedding')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.match_type).toBe('none');
    expect(body.data.guests).toHaveLength(0);
  });

  it('returns 400 for a query shorter than 2 characters', async () => {
    const response = await GET(
      makeRequest('test-wedding', 'A'),
      makeParams('test-wedding')
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 if the wedding slug does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const response = await GET(
      makeRequest('fake-wedding', 'Adi'),
      makeParams('fake-wedding')
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('WEDDING_NOT_FOUND');
  });
});
