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

import { POST } from '@/app/api/v1/dashboard/weddings/[weddingId]/timeline/upload/route';

function makeParams(weddingId = 'w-1') {
  return { params: Promise.resolve({ weddingId }) };
}

function buildXlsx(): Buffer {
  const wb = XLSX.utils.book_new();
  const basic = XLSX.utils.aoa_to_sheet([
    ['SHRIYA & NEIL'],
    [''],
    ['Vendor Category', 'Company / Name', 'Deposit / Payment Status', 'Notes'],
    ['DJ', 'Jas Johal', '', ''],
  ]);
  XLSX.utils.book_append_sheet(wb, basic, 'Basic Info - Venues & Vendors');
  const master = XLSX.utils.aoa_to_sheet([
    ['MASTER TIMELINE'],
    [''],
    ['Time', 'Action', 'Location', 'Vendor(s)', 'Notes', 'Status'],
    ['📅 SEPTEMBER 9, 2026 — HALDI — Hotel Estela'],
    ['10:00 AM', 'Setup', 'Garden', 'Jas Johal', '', ''],
  ]);
  XLSX.utils.book_append_sheet(wb, master, 'Master Timeline');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('POST /api/v1/dashboard/weddings/[weddingId]/timeline/upload', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    // Default: empty existing-vendors lookup, all subsequent operations succeed
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, name, company FROM vendors')) return { rows: [] };
      if (sql.includes('INSERT INTO vendors')) return { rows: [{ id: 'v-new', name: 'Jas Johal' }] };
      if (sql.includes('INSERT INTO timeline_entries')) return { rows: [{ id: 'e-new' }] };
      return { rows: [] };
    });
  });

  it('parses the workbook and returns sync stats', async () => {
    const buffer = buildXlsx();
    const file = new File([new Uint8Array(buffer)], 'wedding.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const form = new FormData();
    form.append('file', file);

    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/timeline/upload', {
      method: 'POST',
      body: form,
    });

    const res = await POST(req, makeParams());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.vendors_synced).toBe(1);
    expect(body.data.entries_synced).toBe(1);
  });

  it('rejects non-xlsx uploads', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const form = new FormData();
    form.append('file', file);
    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/timeline/upload', {
      method: 'POST',
      body: form,
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
  });

  it('rejects when no file is provided', async () => {
    const form = new FormData();
    const req = new NextRequest('http://localhost:3000/api/v1/dashboard/weddings/w-1/timeline/upload', {
      method: 'POST',
      body: form,
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
  });
});
