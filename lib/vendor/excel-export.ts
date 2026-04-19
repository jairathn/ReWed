import * as XLSX from 'xlsx';
import type { Pool } from 'pg';

const BASIC_INFO_SHEET = 'Basic Info - Venues & Vendors';
const MASTER_TIMELINE_SHEET = 'Master Timeline';

interface VendorRow {
  id: string;
  name: string;
  company: string | null;
  category: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: boolean;
  deposit_status: string | null;
  notes: string | null;
}

interface TimelineRow {
  id: string;
  event_date: string | null;
  event_name: string | null;
  time_label: string | null;
  sort_order: number;
  action: string;
  location: string | null;
  notes: string | null;
  status: string | null;
}

interface EmergencyContact {
  role?: string;
  name?: string;
  phone?: string | null;
  whatsapp?: boolean;
}

interface WeddingRow {
  display_name: string;
  config: Record<string, unknown> | null;
}

function rowsToSheet(rows: (string | number | null)[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows);
}

function formatDateLong(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildBasicInfoSheet(
  wedding: WeddingRow,
  vendors: VendorRow[]
): XLSX.WorkSheet {
  const emergency = (Array.isArray(wedding.config?.emergency_contacts)
    ? (wedding.config!.emergency_contacts as EmergencyContact[])
    : []);

  const rows: (string | number | null)[][] = [];
  rows.push([wedding.display_name.toUpperCase(), '', '', '']);
  rows.push(['', '', '', '']);

  // Vendors table
  rows.push(['Vendor Category', 'Company / Name', 'Deposit / Payment Status', 'Notes']);
  for (const v of vendors) {
    rows.push([
      v.category || '',
      v.company || v.name,
      v.deposit_status || '',
      v.notes || '',
    ]);
  }
  rows.push(['', '', '', '']);
  rows.push(['', '', '', '']);

  // Emergency contacts
  rows.push(['EMERGENCY CONTACTS (Day-Of)', '', '', '']);
  rows.push(['Role', 'Name', 'Phone Number', 'WhatsApp?']);
  for (const c of emergency) {
    rows.push([
      c.role || '',
      c.name || '',
      c.phone || '',
      c.whatsapp ? 'Yes' : 'No',
    ]);
  }

  return rowsToSheet(rows);
}

function buildMasterTimelineSheet(
  wedding: WeddingRow,
  entries: Array<TimelineRow & { vendor_names: string[] }>
): XLSX.WorkSheet {
  const rows: (string | number | null)[][] = [];
  rows.push([
    `MASTER TIMELINE — ${wedding.display_name.toUpperCase()}`,
    '', '', '', '', '',
  ]);
  rows.push(['', '', '', '', '', '']);
  rows.push(['Time', 'Action', 'Location', 'Vendor(s)', 'Notes / Instructions', 'Status']);

  let lastDateKey = '';
  for (const e of entries) {
    const dateKey = `${e.event_date}__${e.event_name}`;
    if (dateKey !== lastDateKey) {
      rows.push([
        `📅 ${formatDateLong(e.event_date).toUpperCase()}${e.event_name ? ' — ' + e.event_name.toUpperCase() : ''}`,
        '', '', '', '', '',
      ]);
      lastDateKey = dateKey;
    }
    rows.push([
      e.time_label || '',
      e.action,
      e.location || '',
      e.vendor_names.join(', '),
      e.notes || '',
      e.status || '',
    ]);
  }

  return rowsToSheet(rows);
}

function buildVendorSheet(
  vendor: VendorRow,
  entries: Array<TimelineRow>
): XLSX.WorkSheet {
  const rows: (string | number | null)[][] = [];
  rows.push([`VENDOR TIMELINE — ${vendor.name.toUpperCase()}`, '', '', '', '', '']);
  if (vendor.category) {
    rows.push([`Role: ${vendor.category}`, '', '', '', '', '']);
  }
  rows.push(['', '', '', '', '', '']);

  const contactBits: string[] = [];
  if (vendor.email) contactBits.push(`Email: ${vendor.email}`);
  if (vendor.phone) contactBits.push(`Phone: ${vendor.phone}${vendor.whatsapp ? ' (WhatsApp)' : ''}`);
  if (contactBits.length > 0) {
    rows.push([contactBits.join(' · '), '', '', '', '', '']);
    rows.push(['', '', '', '', '', '']);
  }

  rows.push(['Time', 'Action / Instruction', 'Location', 'Notes', 'Status', '']);

  let lastDateKey = '';
  for (const e of entries) {
    const dateKey = `${e.event_date}__${e.event_name}`;
    if (dateKey !== lastDateKey) {
      rows.push([
        `📅 ${formatDateLong(e.event_date).toUpperCase()}${e.event_name ? ' — ' + e.event_name.toUpperCase() : ''}`,
        '', '', '', '', '',
      ]);
      lastDateKey = dateKey;
    }
    rows.push([
      e.time_label || '',
      e.action,
      e.location || '',
      e.notes || '',
      e.status || '',
      '',
    ]);
  }

  return rowsToSheet(rows);
}

/**
 * Sanitize a vendor name into a valid Excel sheet name (≤31 chars, no special
 * characters \ / ? * [ ]).
 */
function sheetNameFor(vendor: VendorRow): string {
  const base = vendor.name.replace(/[\\/\?\*\[\]:]/g, '').trim() || 'Vendor';
  return base.slice(0, 31);
}

export async function buildWeddingWorkbook(
  pool: Pool,
  weddingId: string
): Promise<{ buffer: Buffer; filename: string }> {
  const weddingResult = await pool.query<WeddingRow>(
    `SELECT display_name, config FROM weddings WHERE id = $1`,
    [weddingId]
  );
  if (weddingResult.rows.length === 0) {
    throw new Error('Wedding not found');
  }
  const wedding = weddingResult.rows[0];

  const vendorsResult = await pool.query<VendorRow>(
    `SELECT id, name, company, category, email, phone, whatsapp,
            deposit_status, notes
     FROM vendors WHERE wedding_id = $1
     ORDER BY category NULLS LAST, name ASC`,
    [weddingId]
  );
  const vendors = vendorsResult.rows;

  const entriesResult = await pool.query<TimelineRow>(
    `SELECT id, event_date, event_name, time_label, sort_order,
            action, location, notes, status
     FROM timeline_entries WHERE wedding_id = $1
     ORDER BY event_date ASC NULLS LAST, sort_order ASC`,
    [weddingId]
  );
  const entries = entriesResult.rows;

  const linksResult = await pool.query(
    `SELECT tev.timeline_entry_id, tev.vendor_id, v.name
     FROM timeline_entry_vendors tev
     JOIN vendors v ON v.id = tev.vendor_id
     WHERE v.wedding_id = $1`,
    [weddingId]
  );
  const linksByEntry = new Map<string, string[]>();
  const entriesByVendor = new Map<string, TimelineRow[]>();
  for (const row of linksResult.rows) {
    const list = linksByEntry.get(row.timeline_entry_id) || [];
    list.push(row.name);
    linksByEntry.set(row.timeline_entry_id, list);
  }
  for (const e of entries) {
    const vendorIdsForEntry = linksResult.rows
      .filter((r) => r.timeline_entry_id === e.id)
      .map((r) => r.vendor_id);
    for (const vid of vendorIdsForEntry) {
      const list = entriesByVendor.get(vid) || [];
      list.push(e);
      entriesByVendor.set(vid, list);
    }
  }

  const enrichedEntries = entries.map((e) => ({
    ...e,
    vendor_names: linksByEntry.get(e.id) || [],
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildBasicInfoSheet(wedding, vendors), BASIC_INFO_SHEET);
  XLSX.utils.book_append_sheet(wb, buildMasterTimelineSheet(wedding, enrichedEntries), MASTER_TIMELINE_SHEET);

  const usedNames = new Set<string>([BASIC_INFO_SHEET, MASTER_TIMELINE_SHEET]);
  for (const v of vendors) {
    let name = sheetNameFor(v);
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${sheetNameFor(v).slice(0, 28)} (${suffix++})`;
    }
    usedNames.add(name);
    const vendorEntries = entriesByVendor.get(v.id) || [];
    XLSX.utils.book_append_sheet(wb, buildVendorSheet(v, vendorEntries), name);
  }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const safeName = wedding.display_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'wedding';
  const filename = `${safeName}-timeline.xlsx`;

  return { buffer, filename };
}
