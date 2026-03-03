import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the database pool before importing the route
const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: vi.fn(),
  }),
}));

import { GET } from '@/app/api/v1/w/[slug]/config/route';

const MOCK_WEDDING = {
  id: 'w-001',
  slug: 'neil-shriya',
  display_name: "Neil & Shriya's Wedding",
  hashtag: '#NeilShriya2026',
  wedding_date: '2026-06-15',
  status: 'active',
  config: {
    couple_names: { name1: 'Neil', name2: 'Shriya' },
    hashtag: '#NeilShriya2026',
    theme: {
      preset: 'mediterranean',
      colors: { primary: '#C4704B', secondary: '#2B5F8A', bg: '#FEFCF9', text: '#2C2825' },
      fonts: { heading: 'Playfair Display', body: 'DM Sans' },
    },
    prompts: {
      heartfelt: ['What is your favorite memory with the couple?'],
      fun: ['Rate their dance moves 1-10'],
      quick_takes: ['One word to describe them'],
    },
    enabled_filters: ['film-grain', 'golden-hour'],
    enabled_ai_styles: ['castle-wedding', 'mughal'],
  },
  package_config: {
    guest_limit: 200,
    event_limit: 3,
    social_feed: true,
    faq_chatbot: true,
    ai_portraits_per_guest: 5,
  },
};

const MOCK_EVENTS = [
  {
    id: 'e-001',
    name: 'Haldi',
    date: '2026-06-14',
    start_time: '10:00',
    end_time: '13:00',
    venue_name: 'Garden Pavilion',
    venue_address: '123 Wedding Lane',
    dress_code: 'Yellow/White',
    description: 'Turmeric ceremony',
    logistics: 'Shuttle from hotel at 9:30 AM',
    accent_color: '#D4A853',
  },
];

function makeRequest(slug: string) {
  return new NextRequest(`http://localhost:3000/api/v1/w/${slug}/config`);
}

function makeParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe('GET /api/v1/w/[slug]/config', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns full wedding config for a valid slug', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [MOCK_WEDDING] }) // wedding query
      .mockResolvedValueOnce({ rows: MOCK_EVENTS });    // events query

    const response = await GET(makeRequest('neil-shriya'), makeParams('neil-shriya'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.slug).toBe('neil-shriya');
    expect(body.data.display_name).toBe("Neil & Shriya's Wedding");
    expect(body.data.couple_names).toEqual({ name1: 'Neil', name2: 'Shriya' });
    expect(body.data.events).toHaveLength(1);
    expect(body.data.events[0].name).toBe('Haldi');
    expect(body.data.events[0].accent_color).toBe('#D4A853');
    expect(body.data.features.social_feed).toBe(true);
    expect(body.data.features.ai_portraits_per_guest).toBe(5);
    expect(body.data.theme.preset).toBe('mediterranean');
    expect(body.data.prompts.heartfelt).toHaveLength(1);
    expect(body.data.enabled_filters).toContain('film-grain');
  });

  it('returns 404 for a non-existent slug', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const response = await GET(makeRequest('does-not-exist'), makeParams('does-not-exist'));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('WEDDING_NOT_FOUND');
  });

  it('returns 403 for an archived wedding', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...MOCK_WEDDING, status: 'archived' }],
    });

    const response = await GET(makeRequest('neil-shriya'), makeParams('neil-shriya'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('WEDDING_INACTIVE');
  });

  it('returns sane defaults when config fields are empty', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          ...MOCK_WEDDING,
          config: {},
          package_config: {},
          hashtag: null,
          wedding_date: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] }); // no events

    const response = await GET(makeRequest('neil-shriya'), makeParams('neil-shriya'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.couple_names).toEqual({ name1: '', name2: '' });
    expect(body.data.theme.preset).toBe('mediterranean');
    expect(body.data.events).toHaveLength(0);
    expect(body.data.features.ai_portraits_per_guest).toBe(5);
    expect(body.data.features.social_feed).toBe(false);
  });
});
