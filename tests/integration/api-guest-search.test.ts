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

function makeRequest(slug: string, q: string, limit?: number) {
  let urlStr = `http://localhost:3000/api/v1/w/${slug}/guests/search?q=${encodeURIComponent(q)}`;
  if (limit) urlStr += `&limit=${limit}`;
  return new NextRequest(urlStr);
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe('GET /api/v1/w/[slug]/guests/search', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns matching guests for a valid query', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] }) // wedding lookup
      .mockResolvedValueOnce({                             // guest search
        rows: [
          { id: 'g-001', first_name: 'Aditya', last_name: 'Sharma' },
          { id: 'g-002', first_name: 'Aditi', last_name: 'Gupta' },
        ],
      });

    const response = await GET(makeRequest('test-wedding', 'Adi'), makeParams('test-wedding'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.guests).toHaveLength(2);
    expect(body.data.guests[0].first_name).toBe('Aditya');
    expect(body.data.guests[1].first_name).toBe('Aditi');
  });

  it('returns empty array when no guests match', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await GET(makeRequest('test-wedding', 'Zzz'), makeParams('test-wedding'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.guests).toHaveLength(0);
  });

  it('returns 400 for a query shorter than 2 characters', async () => {
    const response = await GET(makeRequest('test-wedding', 'A'), makeParams('test-wedding'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 if the wedding slug does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const response = await GET(makeRequest('fake-wedding', 'Adi'), makeParams('fake-wedding'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('WEDDING_NOT_FOUND');
  });

  it('respects the limit parameter', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'g-001', first_name: 'Priya', last_name: 'Patel' }],
      });

    const response = await GET(makeRequest('test-wedding', 'Pri', 1), makeParams('test-wedding'));
    const body = await response.json();

    expect(response.status).toBe(200);
    // Verify limit was passed to query
    const lastCall = mockQuery.mock.calls[1];
    expect(lastCall[1][3]).toBe(1); // limit param
  });

  it('passes the search term with wildcards to the query', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001' }] })
      .mockResolvedValueOnce({ rows: [] });

    await GET(makeRequest('test-wedding', 'Vik'), makeParams('test-wedding'));

    const guestSearchCall = mockQuery.mock.calls[1];
    expect(guestSearchCall[1][1]).toBe('%Vik%'); // ILIKE wildcard
    expect(guestSearchCall[1][2]).toBe('Vik%');  // prefix match for ordering
  });
});
