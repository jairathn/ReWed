import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWeddingWorkbook } from '@/lib/vendor/excel-export';
import { parseWeddingExcel } from '@/lib/vendor/excel-parser';

interface MockRow {
  rows: unknown[];
}

function makePool(rows: Record<string, MockRow>) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM weddings')) return rows.wedding;
    if (sql.includes('FROM vendors')) return rows.vendors;
    if (sql.includes('FROM timeline_entries')) return rows.entries;
    if (sql.includes('timeline_entry_vendors')) return rows.links;
    return { rows: [] };
  });
  return { query } as unknown as import('pg').Pool;
}

describe('buildWeddingWorkbook + parseWeddingExcel roundtrip', () => {
  it('exports a workbook that the parser can read back', async () => {
    const pool = makePool({
      wedding: {
        rows: [{
          display_name: 'Test Wedding',
          config: {
            emergency_contacts: [
              { role: 'Bride', name: 'Shriya', phone: '+13095336646', whatsapp: true },
            ],
          },
        }],
      },
      vendors: {
        rows: [
          { id: 'v-1', name: 'Jas Johal', company: 'Jas Johal', category: 'DJ / MC', email: 'jas@x.com', phone: '+44 1234', whatsapp: false, deposit_status: 'Deposit £2k', notes: 'Combined' },
          { id: 'v-2', name: 'Flors Bertran', company: 'Flors Bertran', category: 'Decor', email: null, phone: null, whatsapp: false, deposit_status: null, notes: null },
        ],
      },
      entries: {
        rows: [
          { id: 'e-1', event_date: '2026-09-09', event_name: 'HALDI', time_label: '10:00 AM', sort_order: 600, action: 'Decor setup', location: 'Garden', notes: null, status: null },
          { id: 'e-2', event_date: '2026-09-09', event_name: 'HALDI', time_label: '3:00 PM', sort_order: 900, action: 'Music setup', location: 'Garden', notes: null, status: null },
          { id: 'e-3', event_date: '2026-09-11', event_name: 'WEDDING', time_label: '3:30 PM', sort_order: 990, action: 'Baraat', location: 'Lawn', notes: null, status: null },
        ],
      },
      links: {
        rows: [
          { timeline_entry_id: 'e-1', vendor_id: 'v-2', name: 'Flors Bertran' },
          { timeline_entry_id: 'e-2', vendor_id: 'v-1', name: 'Jas Johal' },
          { timeline_entry_id: 'e-3', vendor_id: 'v-1', name: 'Jas Johal' },
        ],
      },
    });

    const { buffer, filename } = await buildWeddingWorkbook(pool, 'w-1');
    expect(filename).toMatch(/\.xlsx$/);

    // Parse it back
    const reparsed = parseWeddingExcel(buffer);

    // Vendor list survived
    const names = reparsed.vendors.map((v) => v.name);
    expect(names).toContain('Jas Johal');
    expect(names).toContain('Flors Bertran');

    // Timeline entries survived (order-preserving) — we should see all 3 actions
    const actions = reparsed.timeline.map((e) => e.action);
    expect(actions).toContain('Decor setup');
    expect(actions).toContain('Music setup');
    expect(actions).toContain('Baraat');

    // Vendor references attached to the right entries
    const baraat = reparsed.timeline.find((e) => e.action === 'Baraat')!;
    expect(baraat.vendor_names).toContain('Jas Johal');

    // Per-vendor sheets are appended too
    const wb = XLSX.read(buffer, { type: 'buffer' });
    expect(wb.SheetNames).toContain('Jas Johal');
    expect(wb.SheetNames).toContain('Flors Bertran');
  });
});
