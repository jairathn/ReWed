import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy as middleware } from '@/proxy';

function makeRequest(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe('Edge Middleware', () => {
  describe('/w/[slug] routes', () => {
    it('sets x-wedding-slug header for valid slug', () => {
      const response = middleware(makeRequest('/w/neil-shriya/home'));

      expect(response.headers.get('x-middleware-request-x-wedding-slug')).toBe('neil-shriya');
    });

    it('sets slug header for nested paths', () => {
      const response = middleware(makeRequest('/w/my-wedding/schedule'));

      expect(response.headers.get('x-middleware-request-x-wedding-slug')).toBe('my-wedding');
    });

    it('redirects to / when /w/ has no slug', () => {
      const response = middleware(makeRequest('/w/'));

      // NextResponse.redirect returns a 307 by default
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toContain('/');
    });
  });

  describe('/dashboard routes', () => {
    it('allows access to dashboard without auth token (Phase 3 will enforce)', () => {
      const response = middleware(makeRequest('/dashboard'));

      // Should pass through (not redirect)
      expect(response.status).not.toBe(307);
    });
  });

  describe('unmatched routes', () => {
    it('passes through non-matched routes', () => {
      const response = middleware(makeRequest('/api/v1/w/test/config'));

      expect(response.status).not.toBe(307);
    });
  });
});
