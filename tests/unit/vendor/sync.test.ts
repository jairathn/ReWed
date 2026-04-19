import { describe, it, expect, vi } from 'vitest';
import { syncTimelineFromParsedExcel } from '@/lib/vendor/sync';
import type { ParsedExcel } from '@/lib/vendor/excel-parser';

interface MockPool {
  query: ReturnType<typeof vi.fn>;
  // expose call log for assertions
}

function makePool(initialVendors: Array<{ id: string; name: string; company: string | null }> = []): MockPool {
  let vendorCounter = 100;
  let entryCounter = 0;
  const vendors = [...initialVendors];

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('SELECT id, name, company FROM vendors')) {
      return { rows: vendors };
    }
    if (sql.startsWith('UPDATE weddings')) {
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE vendors')) {
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO vendors')) {
      const name = params[1] as string;
      const company = params[2] as string | null;
      const id = `v-${vendorCounter++}`;
      vendors.push({ id, name, company });
      return { rows: [{ id, name }] };
    }
    if (sql.includes('DELETE FROM timeline_entries')) {
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO timeline_entries')) {
      const id = `e-${entryCounter++}`;
      return { rows: [{ id }] };
    }
    if (sql.includes('INSERT INTO timeline_entry_vendors')) {
      return { rows: [] };
    }
    return { rows: [] };
  });

  return { query };
}

const samplePayload: ParsedExcel = {
  vendors: [
    { category: 'DJ / MC', company: 'Jas Johal', name: 'Jas Johal', deposit_status: null, notes: null },
    { category: 'Decor', company: 'Flors Bertran', name: 'Flors Bertran', deposit_status: null, notes: null },
  ],
  emergencyContacts: [],
  timeline: [
    {
      event_date: '2026-09-09',
      event_name: 'HALDI',
      time_label: '10:00 AM',
      sort_order: 600,
      action: 'Decor setup',
      location: 'Garden',
      vendor_names: ['Flors Bertran'],
      notes: null,
      status: null,
      deadline: false,
    },
    {
      event_date: '2026-09-09',
      event_name: 'HALDI',
      time_label: '3:00 PM',
      sort_order: 900,
      action: 'Music setup',
      location: 'Garden',
      vendor_names: ['Jas Johal'],
      notes: null,
      status: null,
      deadline: false,
    },
    {
      event_date: '2026-09-09',
      event_name: 'HALDI',
      time_label: '4:00 PM',
      sort_order: 960,
      action: 'Mystery vendor',
      location: 'Garden',
      vendor_names: ['Some Random Person'],
      notes: null,
      status: null,
      deadline: false,
    },
  ],
};

describe('syncTimelineFromParsedExcel', () => {
  it('inserts new vendors and links timeline entries', async () => {
    const pool = makePool();
    const result = await syncTimelineFromParsedExcel(
      pool as unknown as import('pg').Pool,
      'w-1',
      samplePayload
    );
    expect(result.vendorCount).toBe(2);
    expect(result.entryCount).toBe(3);
    expect(result.unmatchedVendors).toEqual(['Some Random Person']);

    const inserts = pool.query.mock.calls
      .map((c) => c[0] as string)
      .filter((sql) => sql.includes('INSERT INTO vendors'));
    expect(inserts).toHaveLength(2);

    // Unmatched vendor name should be preserved in the timeline entry's notes
    const timelineInserts = pool.query.mock.calls.filter(
      (c) => (c[0] as string).includes('INSERT INTO timeline_entries')
    );
    // Third entry ("Mystery vendor") had unmatched vendor "Some Random Person"
    const thirdEntryParams = timelineInserts[2][1] as unknown[];
    const notes = thirdEntryParams[7] as string;
    expect(notes).toContain('Some Random Person');
  });

  it('preserves existing vendor rows on re-sync (UPDATE not INSERT)', async () => {
    const pool = makePool([
      { id: 'v-existing-jas', name: 'Jas Johal', company: 'Jas Johal' },
    ]);
    await syncTimelineFromParsedExcel(
      pool as unknown as import('pg').Pool,
      'w-1',
      samplePayload
    );

    const inserts = pool.query.mock.calls
      .map((c) => c[0] as string)
      .filter((sql) => sql.includes('INSERT INTO vendors'));
    // Jas already existed — only Flors should be inserted
    expect(inserts).toHaveLength(1);

    const updates = pool.query.mock.calls
      .map((c) => c[0] as string)
      .filter((sql) => sql.startsWith('UPDATE vendors'));
    expect(updates.length).toBeGreaterThanOrEqual(1);
  });

  it('matches vendor references case-insensitively and ignores parenthetical roles', async () => {
    const pool = makePool();
    const payload: ParsedExcel = {
      ...samplePayload,
      timeline: [
        {
          event_date: '2026-09-09',
          event_name: 'HALDI',
          time_label: '10:00 AM',
          sort_order: 600,
          action: 'Set up',
          location: 'Garden',
          vendor_names: ['JAS JOHAL'],
          notes: null,
          status: null,
          deadline: false,
        },
      ],
    };
    const result = await syncTimelineFromParsedExcel(
      pool as unknown as import('pg').Pool,
      'w-1',
      payload
    );
    expect(result.unmatchedVendors).toEqual([]);
  });
});
