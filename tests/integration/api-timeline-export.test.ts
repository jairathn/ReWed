import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';

const mockQuery = vi.fn();
vi.mock('@/lib/db/client', () => ({
  getPool: () => ({ query: mockQuery, connect: vi.fn() }),
}));

vi.mock('@/lib/dashboard-auth', () => ({
  requireWeddingAccess: vi.fn().mockResolvedValue({ role: 'couple', coupleId: 'c-1' }),
}));

import { GET } from '@/app/api/v1/dashboard/weddings/[weddingId]/timeline/export/route';

function makeParams() {
  return { params: Promise.resolve({ weddingId: 'w-1' }) };
}

describe('GET /api/v1/dashboard/weddings/[weddingId]/timeline/export', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM weddings')) {
        return { rows: [{ display_name: 'Shriya & Neil', config: { emergency_contacts: [] } }] };
      }
      if (sql.includes('FROM vendors')) {
        return {
          rows: [
            { id: 'v-1', name: 'Jas Johal', company: 'Jas Johal', category: 'DJ', email: null, phone: null, whatsapp: false, deposit_status: null, notes: null },
          ],
        };
      }
      if (sql.includes('FROM timeline_entries')) {
        return {
          rows: [
            { id: 'e-1', event_date: '2026-09-09', event_name: 'HALDI', time_label: '10:00 AM', sort_order: 600, action: 'Setup', location: 'Garden', notes: null, status: null },
          ],
        };
      }
      if (sql.includes('timeline_entry_vendors')) {
        return { rows: [{ timeline_entry_id: 'e-1', vendor_id: 'v-1', name: 'Jas Johal' }] };
      }
      return { rows: [] };
    });
  });

  it('returns a downloadable .xlsx with the expected sheets', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/timeline/export');
    const res = await GET(req, makeParams());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/spreadsheetml/);
    const cd = res.headers.get('Content-Disposition');
    expect(cd).toContain('shriya-neil-timeline.xlsx');

    const buffer = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    expect(wb.SheetNames).toContain('Basic Info - Venues & Vendors');
    expect(wb.SheetNames).toContain('Master Timeline');
    expect(wb.SheetNames).toContain('Jas Johal');
  });
});
