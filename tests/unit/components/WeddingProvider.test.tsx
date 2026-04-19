/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { WeddingProvider, useWedding } from '@/components/WeddingProvider';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/w/test-wedding/home',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// A test consumer that exposes the context values
function TestConsumer() {
  const ctx = useWedding();
  return (
    <div>
      <span data-testid="slug">{ctx.slug}</span>
      <span data-testid="loading">{String(ctx.isLoading)}</span>
      <span data-testid="authenticated">{String(ctx.isAuthenticated)}</span>
      <span data-testid="guest-name">{ctx.guest?.first_name || 'none'}</span>
      <span data-testid="config-name">{ctx.config?.display_name || 'none'}</span>
    </div>
  );
}

describe('WeddingProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('provides slug to children', () => {
    render(
      <WeddingProvider slug="test-wedding">
        <TestConsumer />
      </WeddingProvider>
    );

    expect(screen.getByTestId('slug').textContent).toBe('test-wedding');
  });

  it('starts with isAuthenticated=false and no guest', () => {
    render(
      <WeddingProvider slug="test-wedding">
        <TestConsumer />
      </WeddingProvider>
    );

    expect(screen.getByTestId('authenticated').textContent).toBe('false');
    expect(screen.getByTestId('guest-name').textContent).toBe('none');
  });

  it('uses initialConfig when provided and skips fetch', () => {
    const mockConfig = {
      wedding_id: 'w-001',
      slug: 'test-wedding',
      display_name: "Test Wedding",
      couple_names: { name1: 'A', name2: 'B' },
      hashtag: '#Test',
      wedding_date: null,
      timezone: 'America/New_York',
      status: 'active' as const,
      theme: {
        preset: 'mediterranean',
        colors: { primary: '#C4704B', secondary: '#2B5F8A', bg: '#FEFCF9', text: '#2C2825' },
        fonts: { heading: 'Playfair Display', body: 'DM Sans' },
      },
      prompts: { heartfelt: [], fun: [], quick_takes: [] },
      enabled_filters: [],
      enabled_ai_styles: [],
      rsvp_url: null,
      events: [],
      venue_city: null,
      venue_country: null,
      venue_lat: null,
      venue_lng: null,
      wedding_planner: null,
      guest_background: null,
      home_card_images: { schedule: null, travel: null } as {
        schedule: { url: string; position: string } | null;
        travel: { url: string; position: string } | null;
      },
      features: {
        social_feed: false,
        faq_chatbot: false,
        sms_notifications: false,
        ai_portraits: true,
        ai_portraits_per_guest: 5,
      },
    };

    render(
      <WeddingProvider slug="test-wedding" initialConfig={mockConfig}>
        <TestConsumer />
      </WeddingProvider>
    );

    expect(screen.getByTestId('loading').textContent).toBe('false');
    expect(screen.getByTestId('config-name').textContent).toBe('Test Wedding');
  });

  it('restores guest from localStorage', async () => {
    localStorage.setItem(
      'guest_test-wedding',
      JSON.stringify({
        id: 'g-001',
        first_name: 'Aditya',
        last_name: 'Sharma',
        display_name: 'Aditya Sharma',
        email: null,
        group_label: null,
      })
    );

    render(
      <WeddingProvider slug="test-wedding">
        <TestConsumer />
      </WeddingProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('guest-name').textContent).toBe('Aditya');
      expect(screen.getByTestId('authenticated').textContent).toBe('true');
    });
  });

  it('sets guest via setGuest and persists to localStorage', async () => {
    function SetGuestButton() {
      const { setGuest } = useWedding();
      return (
        <button
          onClick={() =>
            setGuest({
              id: 'g-002',
              first_name: 'Priya',
              last_name: 'Patel',
              display_name: 'Priya Patel',
              email: null,
              group_label: 'Family',
            })
          }
        >
          Set Guest
        </button>
      );
    }

    render(
      <WeddingProvider slug="test-wedding">
        <TestConsumer />
        <SetGuestButton />
      </WeddingProvider>
    );

    expect(screen.getByTestId('authenticated').textContent).toBe('false');

    await act(async () => {
      screen.getByText('Set Guest').click();
    });

    expect(screen.getByTestId('authenticated').textContent).toBe('true');
    expect(screen.getByTestId('guest-name').textContent).toBe('Priya');

    // Check localStorage persistence
    const stored = JSON.parse(localStorage.getItem('guest_test-wedding')!);
    expect(stored.first_name).toBe('Priya');
  });

  it('fetches config from API when no initialConfig is provided', async () => {
    const mockResponse = {
      data: {
        wedding_id: 'w-001',
        slug: 'test-wedding',
        display_name: 'Fetched Wedding',
        couple_names: { name1: 'X', name2: 'Y' },
        hashtag: '#Fetched',
        wedding_date: null,
        timezone: 'America/New_York',
        status: 'active',
        venue_city: null,
        venue_country: null,
        venue_lat: null,
        venue_lng: null,
        theme: {
          preset: 'mediterranean',
          colors: { primary: '#C4704B', secondary: '#2B5F8A', bg: '#FEFCF9', text: '#2C2825' },
          fonts: { heading: 'Playfair Display', body: 'DM Sans' },
        },
        prompts: { heartfelt: [], fun: [], quick_takes: [] },
        enabled_filters: [],
        enabled_ai_styles: [],
        events: [],
        features: {
          social_feed: false,
          faq_chatbot: false,
          sms_notifications: false,
          ai_portraits: true,
          ai_portraits_per_guest: 5,
        },
      },
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    render(
      <WeddingProvider slug="test-wedding">
        <TestConsumer />
      </WeddingProvider>
    );

    // Initially loading
    expect(screen.getByTestId('loading').textContent).toBe('true');

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('config-name').textContent).toBe('Fetched Wedding');
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/v1/w/test-wedding/config');
  });
});
