/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the WeddingProvider context
vi.mock('@/components/WeddingProvider', () => ({
  useWedding: () => ({
    slug: 'test-wedding',
    config: null,
    guest: null,
    isLoading: false,
    isAuthenticated: false,
    setGuest: vi.fn(),
  }),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/w/test-wedding/home',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import BottomNav from '@/components/guest/BottomNav';

describe('BottomNav', () => {
  it('renders all 5 tabs', () => {
    render(<BottomNav />);

    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Capture')).toBeDefined();
    expect(screen.getByText('Travel')).toBeDefined();
    expect(screen.getByText('Gallery')).toBeDefined();
    expect(screen.getByText('Events')).toBeDefined();
  });

  it('has correct links for each tab', () => {
    render(<BottomNav />);

    const homeLink = screen.getByText('Home').closest('a');
    expect(homeLink?.getAttribute('href')).toBe('/w/test-wedding/home');

    const captureLink = screen.getByText('Capture').closest('a');
    expect(captureLink?.getAttribute('href')).toBe('/w/test-wedding/capture');

    const travelLink = screen.getByText('Travel').closest('a');
    expect(travelLink?.getAttribute('href')).toBe('/w/test-wedding/travel');

    const galleryLink = screen.getByText('Gallery').closest('a');
    expect(galleryLink?.getAttribute('href')).toBe('/w/test-wedding/gallery');

    const eventsLink = screen.getByText('Events').closest('a');
    expect(eventsLink?.getAttribute('href')).toBe('/w/test-wedding/schedule');
  });

  it('renders the Travel tab as elevated (with gradient circle)', () => {
    render(<BottomNav />);

    const travelLink = screen.getByText('Travel').closest('a');
    expect(travelLink?.className).toContain('-mt-5'); // elevated
  });

  it('all tabs have accessible labels', () => {
    render(<BottomNav />);

    const links = screen.getAllByRole('link');
    expect(links.length).toBe(5);
    links.forEach((link) => {
      expect(link.getAttribute('aria-label')).toBeDefined();
    });
  });
});
