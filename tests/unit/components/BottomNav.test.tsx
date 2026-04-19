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
  it('renders the four primary tabs', () => {
    render(<BottomNav />);

    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('Schedule')).toBeDefined();
    expect(screen.getByText('Capture')).toBeDefined();
    expect(screen.getByText('Travel')).toBeDefined();
  });

  it('has correct links for each tab', () => {
    render(<BottomNav />);

    const homeLink = screen.getByText('Home').closest('a');
    expect(homeLink?.getAttribute('href')).toBe('/w/test-wedding/home');

    const scheduleLink = screen.getByText('Schedule').closest('a');
    expect(scheduleLink?.getAttribute('href')).toBe('/w/test-wedding/schedule');

    const captureLink = screen.getByText('Capture').closest('a');
    expect(captureLink?.getAttribute('href')).toBe('/w/test-wedding/capture');

    const travelLink = screen.getByText('Travel').closest('a');
    expect(travelLink?.getAttribute('href')).toBe('/w/test-wedding/travel');
  });

  it('all tabs have accessible labels', () => {
    render(<BottomNav />);

    const links = screen.getAllByRole('link');
    expect(links.length).toBe(4);
    links.forEach((link) => {
      expect(link.getAttribute('aria-label')).toBeDefined();
    });
  });
});
