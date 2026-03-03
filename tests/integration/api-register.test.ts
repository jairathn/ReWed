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
  createGuestSession: vi.fn().mockResolvedValue({
    token: 'mock-session-token-abc123',
    guestId: 'g-001',
    sessionId: 's-001',
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: vi.fn(),
    get: vi.fn(),
  }),
}));

import { POST } from '@/app/api/v1/w/[slug]/auth/register/route';
import { createGuestSession } from '@/lib/session';

function makeRequest(slug: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000/api/v1/w/${slug}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe('POST /api/v1/w/[slug]/auth/register', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    vi.mocked(createGuestSession).mockClear();
  });

  it('registers a guest and returns session + profile', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001', status: 'active' }] }) // wedding
      .mockResolvedValueOnce({                                               // guest
        rows: [{
          id: 'g-001',
          first_name: 'Aditya',
          last_name: 'Sharma',
          email: 'adi@test.com',
          group_label: 'College Friends',
        }],
      });

    const response = await POST(
      makeRequest('test-wedding', { guest_id: '550e8400-e29b-41d4-a716-446655440000' }),
      makeParams('test-wedding'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.session_token).toBe('mock-session-token-abc123');
    expect(body.data.guest.first_name).toBe('Aditya');
    expect(body.data.guest.last_name).toBe('Sharma');
    expect(body.data.guest.display_name).toBe('Aditya Sharma');
    expect(body.data.guest.group_label).toBe('College Friends');
    expect(createGuestSession).toHaveBeenCalledOnce();
  });

  it('returns 400 for an invalid guest_id format', async () => {
    const response = await POST(
      makeRequest('test-wedding', { guest_id: 'not-a-uuid' }),
      makeParams('test-wedding'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(mockQuery).not.toHaveBeenCalled(); // should reject before DB
  });

  it('returns 404 when wedding slug is not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const response = await POST(
      makeRequest('fake-wedding', { guest_id: '550e8400-e29b-41d4-a716-446655440000' }),
      makeParams('fake-wedding'),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('WEDDING_NOT_FOUND');
  });

  it('returns 403 when wedding is archived', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'w-001', status: 'archived' }] });

    const response = await POST(
      makeRequest('test-wedding', { guest_id: '550e8400-e29b-41d4-a716-446655440000' }),
      makeParams('test-wedding'),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('WEDDING_INACTIVE');
  });

  it('returns 404 when guest_id is not on the guest list', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'w-001', status: 'active' }] })
      .mockResolvedValueOnce({ rows: [] }); // guest not found

    const response = await POST(
      makeRequest('test-wedding', { guest_id: '550e8400-e29b-41d4-a716-446655440000' }),
      makeParams('test-wedding'),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('AUTH_GUEST_NOT_FOUND');
  });

  it('returns 400 when body is missing guest_id', async () => {
    const response = await POST(
      makeRequest('test-wedding', {}),
      makeParams('test-wedding'),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
  });
});
