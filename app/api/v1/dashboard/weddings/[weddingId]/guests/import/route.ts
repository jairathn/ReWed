import { NextRequest } from 'next/server';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { isTestMode } from '@/lib/env';

interface ColumnMapping {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  group_label: string | null;
  rsvp_status: string | null;
}

// Common column name variations for auto-mapping
const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  first_name: ['first name', 'first_name', 'firstname', 'first', 'given name', 'guest first name', 'name first'],
  last_name: ['last name', 'last_name', 'lastname', 'last', 'surname', 'family name', 'guest last name', 'name last'],
  email: ['email', 'email address', 'e-mail', 'guest email', 'email_address'],
  phone: ['phone', 'phone number', 'cell', 'cell phone', 'mobile', 'telephone', 'phone_number', 'guest phone'],
  group_label: ['group', 'group label', 'group_label', 'party', 'table', 'category', 'guest group'],
  rsvp_status: ['rsvp', 'rsvp status', 'rsvp_status', 'status', 'response', 'attending'],
};

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'CSV file is empty');
  }

  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          cells.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);

  return { headers, rows };
}

function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    first_name: null,
    last_name: null,
    email: null,
    phone: null,
    group_label: null,
    rsvp_status: null,
  };

  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof ColumnMapping, string[]][]) {
    for (const alias of aliases) {
      const idx = normalizedHeaders.indexOf(alias);
      if (idx !== -1 && mapping[field] === null) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }

  // Handle "Name" column (single name field) — split into first/last
  if (!mapping.first_name && !mapping.last_name) {
    const nameIdx = normalizedHeaders.findIndex((h) => h === 'name' || h === 'full name' || h === 'guest name');
    if (nameIdx !== -1) {
      mapping.first_name = `__split_name:${headers[nameIdx]}`;
      mapping.last_name = `__split_name:${headers[nameIdx]}`;
    }
  }

  return mapping;
}

async function aiMapColumns(headers: string[]): Promise<ColumnMapping> {
  if (isTestMode()) {
    return autoMapColumns(headers);
  }

  try {
    const { getOpenAIClient, CHAT_MODEL_MINI } = await import('@/lib/ai/openai');
    const openai = getOpenAIClient();

    const response = await openai.chat.completions.create({
      model: CHAT_MODEL_MINI,
      messages: [
        {
          role: 'system',
          content: `You are a CSV column mapper. Given CSV headers, map them to these fields: first_name, last_name, email, phone, group_label, rsvp_status. Return a JSON object mapping each field to the exact CSV header name, or null if no match. If there's a single "Name" column, return it for both first_name and last_name with prefix "__split_name:".`,
        },
        {
          role: 'user',
          content: `CSV headers: ${JSON.stringify(headers)}\n\nReturn ONLY valid JSON, no markdown.`,
        },
      ],
      max_tokens: 200,
      temperature: 0,
    });

    const text = response.choices[0]?.message?.content || '';
    return JSON.parse(text) as ColumnMapping;
  } catch {
    // Fall back to heuristic mapping
    return autoMapColumns(headers);
  }
}

function normalizeRsvp(value: string): 'pending' | 'attending' | 'declined' {
  const v = value.toLowerCase().trim();
  if (['attending', 'yes', 'accepted', 'confirmed', 'going', 'accept'].includes(v)) return 'attending';
  if (['declined', 'no', 'not attending', 'regrets', 'decline'].includes(v)) return 'declined';
  return 'pending';
}

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/guests/import
 *
 * Two modes:
 * 1. Preview mode (step=preview): parse CSV, return auto-mapped columns + sample rows
 * 2. Import mode (step=import): apply mapping and insert guests
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string }> }
) {
  try {
    const { weddingId } = await params;
    const coupleId = getCoupleId(request);
    await verifyWeddingOwnership(coupleId, weddingId);

    const body = await request.json();
    const { csv_text, step, column_mapping } = body as {
      csv_text: string;
      step: 'preview' | 'import';
      column_mapping?: ColumnMapping;
    };

    if (!csv_text || typeof csv_text !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'csv_text is required');
    }

    const { headers, rows } = parseCSV(csv_text);

    if (headers.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No headers found in CSV');
    }

    // ── Step 1: Preview ──
    if (step === 'preview') {
      // Try auto-mapping first, then AI if needed
      let mapping = autoMapColumns(headers);
      const hasRequiredFields = mapping.first_name || mapping.last_name;

      if (!hasRequiredFields) {
        mapping = await aiMapColumns(headers);
      }

      // Build preview rows (first 5)
      const preview = rows.slice(0, 5).map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = row[i] || '';
        });
        return obj;
      });

      return Response.json({
        headers,
        mapping,
        preview,
        total_rows: rows.length,
      });
    }

    // ── Step 2: Import ──
    if (step === 'import') {
      const mapping = column_mapping || autoMapColumns(headers);

      if (!mapping.first_name && !mapping.last_name) {
        throw new AppError('VALIDATION_ERROR', 'At least first_name or last_name column must be mapped');
      }

      const pool = getPool();
      const headerIndex = (colName: string | null): number => {
        if (!colName) return -1;
        return headers.findIndex((h) => h === colName);
      };

      // Check for split-name scenario
      const isSplitName = mapping.first_name?.startsWith('__split_name:');
      let splitNameCol = '';
      if (isSplitName && mapping.first_name) {
        splitNameCol = mapping.first_name.replace('__split_name:', '');
      }

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          let firstName: string;
          let lastName: string;

          if (isSplitName) {
            const nameIdx = headers.findIndex((h) => h === splitNameCol);
            const fullName = (nameIdx >= 0 ? row[nameIdx] : '').trim();
            if (!fullName) {
              skipped++;
              continue;
            }
            const parts = fullName.split(/\s+/);
            firstName = parts[0] || '';
            lastName = parts.slice(1).join(' ') || '';
            if (!lastName) lastName = firstName; // Single name — use as both
          } else {
            const fnIdx = headerIndex(mapping.first_name);
            const lnIdx = headerIndex(mapping.last_name);
            firstName = (fnIdx >= 0 ? row[fnIdx] : '').trim();
            lastName = (lnIdx >= 0 ? row[lnIdx] : '').trim();
          }

          if (!firstName && !lastName) {
            skipped++;
            continue;
          }
          if (!firstName) firstName = '-';
          if (!lastName) lastName = '-';

          const emailIdx = headerIndex(mapping.email);
          const phoneIdx = headerIndex(mapping.phone);
          const groupIdx = headerIndex(mapping.group_label);
          const rsvpIdx = headerIndex(mapping.rsvp_status);

          const email = emailIdx >= 0 ? (row[emailIdx] || '').trim() || null : null;
          const phone = phoneIdx >= 0 ? (row[phoneIdx] || '').trim() || null : null;
          const group = groupIdx >= 0 ? (row[groupIdx] || '').trim() || null : null;
          const rsvp = rsvpIdx >= 0 ? normalizeRsvp(row[rsvpIdx] || '') : 'pending';

          await pool.query(
            `INSERT INTO guests (wedding_id, first_name, last_name, email, phone, group_label, rsvp_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [weddingId, firstName, lastName, email, phone, group, rsvp]
          );
          imported++;
        } catch (err) {
          errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          skipped++;
        }
      }

      return Response.json({
        imported,
        skipped,
        total: rows.length,
        errors: errors.slice(0, 10), // Return first 10 errors
      }, { status: 201 });
    }

    throw new AppError('VALIDATION_ERROR', 'step must be "preview" or "import"');
  } catch (error) {
    return handleApiError(error);
  }
}
