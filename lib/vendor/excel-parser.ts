import * as XLSX from 'xlsx';

export type ParsedVendor = {
  category: string;
  company: string | null;
  name: string;
  deposit_status: string | null;
  notes: string | null;
};

export type ParsedTimelineEntry = {
  event_date: string | null;
  event_name: string | null;
  time_label: string | null;
  sort_order: number;
  action: string;
  location: string | null;
  vendor_names: string[];
  notes: string | null;
  status: string | null;
  deadline: boolean;
};

export type ParsedEmergencyContact = {
  role: string;
  name: string;
  phone: string | null;
  whatsapp: boolean;
};

export type ParsedExcel = {
  vendors: ParsedVendor[];
  timeline: ParsedTimelineEntry[];
  emergencyContacts: ParsedEmergencyContact[];
};

const BASIC_INFO_SHEET = 'Basic Info - Venues & Vendors';
const MASTER_TIMELINE_SHEET = 'Master Timeline';

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

function sheetRows(wb: XLSX.WorkBook, name: string): string[][] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  const json = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: '',
  });
  return json.map((row) => row.map(cellToString));
}

function parseDateHeader(header: string): { date: string | null; eventName: string | null } {
  // Format: "📅 SEPTEMBER 8, 2026 — MEHENDI — Hotel Estela Suite"
  // Strip emoji and split by em-dash or hyphen
  const cleaned = header.replace(/^[^\w]*/u, '').trim();
  const parts = cleaned.split(/\s*—\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { date: null, eventName: null };

  const datePart = parts[0];
  const eventName = parts[1] || null;

  // Parse "SEPTEMBER 8, 2026" or "Sept 8, 2026"
  const m = datePart.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return { date: null, eventName };
  const month = MONTHS[m[1].toLowerCase()];
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (!month || !day || !year) return { date: null, eventName };
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { date: iso, eventName };
}

function timeLabelToSortOrder(label: string): number {
  if (!label) return 99999;
  const clean = label.trim();

  // Handle "10:00:00" (24-hour) and ranges like "18:25:00"
  const h24 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24) {
    return parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10);
  }

  // Handle "10:00 AM" / "6:00 PM"
  const ampm = clean.match(/^~?(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const isPM = ampm[3].toUpperCase() === 'PM';
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h * 60 + m;
  }

  // Ranges like "6:00-8:00 PM"
  const range = clean.match(/^(\d{1,2}):(\d{2})/);
  if (range) return parseInt(range[1], 10) * 60 + parseInt(range[2], 10);

  // "Late" / "Late PM"
  if (/late/i.test(clean)) return 1500;
  return 99999;
}

function splitVendorNames(cell: string): string[] {
  if (!cell) return [];
  // Split on commas but be careful: some entries have parens like "Saima (Henna), Marina (HMUA)"
  return cell
    .split(/[,;]|\sand\s|\s&\s|\s\+\s/)
    .map((s) => s.replace(/\([^)]*\)/g, '').trim())
    .filter(Boolean);
}

function parseBasicInfo(rows: string[][]): {
  vendors: ParsedVendor[];
  emergencyContacts: ParsedEmergencyContact[];
} {
  const vendors: ParsedVendor[] = [];
  const emergencyContacts: ParsedEmergencyContact[] = [];

  let mode: 'none' | 'vendors' | 'contacts' = 'none';

  for (const row of rows) {
    const [c0, c1, c2, c3] = row;

    // Section detection
    if (c0 === 'Vendor Category' || /vendor\s*category/i.test(c0)) {
      mode = 'vendors';
      continue;
    }
    if (/emergency\s*contacts/i.test(c0)) {
      mode = 'contacts';
      continue;
    }
    if (mode === 'contacts' && /^role$/i.test(c0)) {
      // header row of contacts section
      continue;
    }
    if (c0 === 'Venue' || c0 === 'Date' || c0 === '') {
      if (c0 === '' && row.every((c) => c === '')) {
        // blank row doesn't reset mode — sections have blank rows mid-way
        continue;
      }
      // header switches handled above; skip unrelated header rows
      if (c0 === 'Venue' || c0 === 'Date') {
        mode = 'none';
        continue;
      }
    }

    if (mode === 'vendors' && c0 && c1) {
      vendors.push({
        category: c0,
        company: c1,
        name: c1,
        deposit_status: c2 || null,
        notes: c3 || null,
      });
    } else if (mode === 'contacts' && c0 && c1) {
      emergencyContacts.push({
        role: c0,
        name: c1,
        phone: c2 ? c2.replace(/\.0$/, '') : null,
        whatsapp: /yes/i.test(c3 || ''),
      });
    }
  }

  return { vendors, emergencyContacts };
}

function parseMasterTimeline(rows: string[][]): ParsedTimelineEntry[] {
  const entries: ParsedTimelineEntry[] = [];
  let currentDate: string | null = null;
  let currentEventName: string | null = null;
  let dayOrder = 0;

  let headerSeen = false;

  for (const row of rows) {
    const [c0, c1, c2, c3, c4, c5] = row;

    if (!headerSeen) {
      if (/^time$/i.test(c0) && /^action$/i.test(c1)) {
        headerSeen = true;
      }
      continue;
    }

    // Date header row (emoji or date-like first cell, action cell empty)
    if (c0.includes('📅') || /^\d{4}|^[A-Z]{3,}/i.test(c0) && !c1) {
      const parsed = parseDateHeader(c0);
      if (parsed.date) {
        currentDate = parsed.date;
        currentEventName = parsed.eventName;
        dayOrder = 0;
        continue;
      }
    }

    // Skip completely blank rows
    if (row.every((c) => !c)) continue;

    // Entry row — must have an action (c1)
    if (!c1) continue;

    const timeLabel = c0 || null;
    const timeSort = timeLabelToSortOrder(c0);
    const sortOrder = timeSort * 1000 + dayOrder;
    dayOrder++;

    const status = c5 || null;
    const deadline = /deadline/i.test(status || '') || /hard stop|deadlne/i.test(c1 || '');

    entries.push({
      event_date: currentDate,
      event_name: currentEventName,
      time_label: timeLabel,
      sort_order: sortOrder,
      action: c1,
      location: c2 || null,
      vendor_names: splitVendorNames(c3 || ''),
      notes: c4 || null,
      status,
      deadline,
    });
  }

  return entries;
}

export function parseWeddingExcel(buffer: Buffer | ArrayBuffer): ParsedExcel {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const basicInfoRows = sheetRows(wb, BASIC_INFO_SHEET);
  const masterRows = sheetRows(wb, MASTER_TIMELINE_SHEET);

  // Fallback: if exact sheet names aren't found, try loose matching
  const basicRows =
    basicInfoRows.length > 0
      ? basicInfoRows
      : sheetRows(wb, wb.SheetNames.find((n) => /basic\s*info/i.test(n)) || '');
  const timelineRows =
    masterRows.length > 0
      ? masterRows
      : sheetRows(wb, wb.SheetNames.find((n) => /master\s*timeline/i.test(n)) || '');

  const { vendors, emergencyContacts } = parseBasicInfo(basicRows);
  const timeline = parseMasterTimeline(timelineRows);

  return { vendors, timeline, emergencyContacts };
}
