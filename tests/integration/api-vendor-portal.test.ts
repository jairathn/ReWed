import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

import { GET } from '@/app/api/v1/v/[slug]/[token]/route';

function makeParams(slug = 'shriya-neil', token = 'a'.repeat(48)) {
  return { params: Promise.resolve({ slug, token }) };
}

describe('GET /api/v1/v/[slug]/[token]', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns vendor + assigned timeline + master + contacts', async () => {
    mockQuery
      // authenticateVendor lookup
      .mockResolvedValueOnce({
        rows: [{
          vendor_id: 'v-1', name: 'Jas Johal', company: null, category: 'DJ / MC',
          email: 'jas@example.com', phone: '+44 1234', whatsapp: false, notes: null,
          wedding_id: 'w-1', slug: 'shriya-neil', display_name: 'Shriya & Neil',
          wedding_date: '2026-09-11', timezone: 'Europe/Madrid',
          venue_city: 'Barcelona', venue_country: 'Spain',
          config: {
            emergency_contacts: [
              { role: 'Bride', name: 'Shriya', phone: '+13095336646', whatsapp: true },
            ],
          },
        }],
      })
      // assigned entries
      .mockResolvedValueOnce({
        rows: [
          { id: 'e-1', event_date: '2026-09-09', event_name: 'HALDI', time_label: '3:00 PM', sort_order: 900, action: 'Music setup', location: 'Garden', notes: null, status: null, deadline: false },
        ],
      })
      // coordination contacts (looked up because assigned > 0)
      .mockResolvedValueOnce({
        rows: [
          { entry_id: 'e-1', id: 'v-2', name: 'Alex Permanyer', category: 'Sound & Light', phone: null, whatsapp: false, email: null },
        ],
      })
      // master timeline
      .mockResolvedValueOnce({
        rows: [
          { id: 'e-1', event_date: '2026-09-09', event_name: 'HALDI', time_label: '3:00 PM', sort_order: 900, action: 'Music setup', location: 'Garden', notes: null, status: null, deadline: false, vendor_names: ['Jas Johal', 'Alex Permanyer'] },
        ],
      });

    const req = new NextRequest('http://localhost:3000/api/v1/v/shriya-neil/' + 'a'.repeat(48));
    const res = await GET(req, makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.vendor.name).toBe('Jas Johal');
    expect(body.data.assigned).toHaveLength(1);
    expect(body.data.coordination_contacts).toHaveLength(1);
    expect(body.data.coordination_contacts[0].name).toBe('Alex Permanyer');
    expect(body.data.master_timeline).toHaveLength(1);
    expect(body.data.emergency_contacts).toHaveLength(1);
  });

  it('returns 404 for an invalid token', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const req = new NextRequest('http://localhost:3000/api/v1/v/shriya-neil/' + 'b'.repeat(48));
    const res = await GET(req, makeParams('shriya-neil', 'b'.repeat(48)));
    expect(res.status).toBe(404);
  });

  it('rejects short tokens before any DB lookup', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/v/shriya-neil/short');
    const res = await GET(req, makeParams('shriya-neil', 'short'));
    expect(res.status).toBe(404);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
