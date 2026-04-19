import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWeddingExcel } from '@/lib/vendor/excel-parser';

function buildFixtureWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();

  const basicInfo = XLSX.utils.aoa_to_sheet([
    ['SHRIYA & NEIL — BARCELONA WEDDING — SEPTEMBER 8–11, 2026', '', '', ''],
    ['', '', '', ''],
    ['Venue', 'Address / Phone', 'Event', 'Dates'],
    ['Hotel Estela', 'Sitges', 'Mehendi (Sept 8)', 'Sept 8–9, 2026'],
    ['', '', '', ''],
    ['Vendor Category', 'Company / Name', 'Deposit / Payment Status', 'Notes'],
    ['DJ / MC', 'Jas Johal', 'Deposit £2,000 GBP', 'Combined DJ + MC'],
    ['Photographer', 'Ruben Larruy', 'Deposit €3,250', 'Haldi + Wedding'],
    ['Decor', 'Flors Bertran', 'Deposit €7,000', 'All decor'],
    ['', '', '', ''],
    ['', '', '', ''],
    ['EMERGENCY CONTACTS (Day-Of)', '', '', ''],
    ['Role', 'Name', 'Phone Number', 'WhatsApp?'],
    ['Groom', 'Neil Jairath', '+18124848334', 'Yes'],
    ['Wedding Planner', 'Evelina', '+34622489276', 'Yes'],
  ]);
  XLSX.utils.book_append_sheet(wb, basicInfo, 'Basic Info - Venues & Vendors');

  const masterTimeline = XLSX.utils.aoa_to_sheet([
    ['MASTER TIMELINE — SHRIYA & NEIL — SEPTEMBER 8–11, 2026', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['Time', 'Action', 'Location', 'Vendor(s)', 'Notes / Instructions', 'Status'],
    ['📅 SEPTEMBER 9, 2026 — HALDI — Hotel Estela', '', '', '', '', ''],
    ['10:00 AM', 'Decor setup begins', 'Hotel Estela garden', 'Flors Bertran', 'Yellow florals', ''],
    ['2:00 PM', 'DECOR HARD STOP', 'Hotel Estela', 'Flors Bertran', 'Deadline before guests', 'DEADLINE'],
    ['3:00 PM', 'Music setup', 'Hotel Estela', 'Jas Johal', 'Background then upbeat', ''],
    ['', '', '', '', '', ''],
    ['📅 SEPTEMBER 11, 2026 — WEDDING — Castell de Sant Marçal', '', '', '', '', ''],
    ['3:30 PM', 'Baraat', 'Parking lot → Lawn', 'Jas Johal, Ruben Larruy', 'Maximum energy', ''],
    ['Late', 'Cellar afterparty', 'Cellar', 'Jas Johal', 'Slow build', 'TO DO'],
  ]);
  XLSX.utils.book_append_sheet(wb, masterTimeline, 'Master Timeline');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('parseWeddingExcel', () => {
  const parsed = parseWeddingExcel(buildFixtureWorkbook());

  it('extracts vendors from the Basic Info sheet', () => {
    expect(parsed.vendors).toHaveLength(3);
    const names = parsed.vendors.map((v) => v.name);
    expect(names).toContain('Jas Johal');
    expect(names).toContain('Ruben Larruy');
    expect(names).toContain('Flors Bertran');

    const jas = parsed.vendors.find((v) => v.name === 'Jas Johal')!;
    expect(jas.category).toBe('DJ / MC');
    expect(jas.deposit_status).toBe('Deposit £2,000 GBP');
    expect(jas.notes).toBe('Combined DJ + MC');
  });

  it('extracts emergency contacts and preserves international phone format', () => {
    expect(parsed.emergencyContacts).toHaveLength(2);
    const evelina = parsed.emergencyContacts.find((c) => c.name === 'Evelina')!;
    expect(evelina.phone).toBe('+34622489276');
    expect(evelina.whatsapp).toBe(true);
  });

  it('parses timeline entries grouped by event date', () => {
    expect(parsed.timeline.length).toBeGreaterThan(0);
    const haldiEntries = parsed.timeline.filter((e) => e.event_date === '2026-09-09');
    const weddingEntries = parsed.timeline.filter((e) => e.event_date === '2026-09-11');
    expect(haldiEntries).toHaveLength(3);
    expect(weddingEntries).toHaveLength(2);
    expect(haldiEntries[0].event_name).toBe('HALDI');
  });

  it('flags deadlines based on the Status column', () => {
    const hardStop = parsed.timeline.find((e) => e.action === 'DECOR HARD STOP');
    expect(hardStop).toBeDefined();
    expect(hardStop!.deadline).toBe(true);
  });

  it('splits comma-separated vendor lists in the timeline', () => {
    const baraat = parsed.timeline.find((e) => e.action === 'Baraat')!;
    expect(baraat.vendor_names).toEqual(expect.arrayContaining(['Jas Johal', 'Ruben Larruy']));
  });

  it('orders entries within a day by parsed time', () => {
    const haldi = parsed.timeline.filter((e) => e.event_date === '2026-09-09');
    // 10 AM should sort before 2 PM, 2 PM before 3 PM
    expect(haldi[0].time_label).toBe('10:00 AM');
    expect(haldi[1].time_label).toBe('2:00 PM');
    expect(haldi[2].time_label).toBe('3:00 PM');
  });

  it('handles fuzzy time labels like "Late" without crashing', () => {
    const late = parsed.timeline.find((e) => e.action === 'Cellar afterparty');
    expect(late).toBeDefined();
    expect(late!.time_label).toBe('Late');
  });
});
