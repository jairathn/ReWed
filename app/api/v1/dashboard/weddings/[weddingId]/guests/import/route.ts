import { NextRequest } from 'next/server';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { getCoupleId, verifyWeddingOwnership } from '@/lib/dashboard-auth';
import { isTestMode } from '@/lib/env';

// Column mapping now covers primary guest, partner, children, and address fields
interface ColumnMapping {
  // Primary guest
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  suffix: string | null;
  email: string | null;
  phone: string | null;
  group_label: string | null;
  rsvp_status: string | null;
  relationship: string | null;
  // Address
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  // Partner
  partner_title: string | null;
  partner_first_name: string | null;
  partner_last_name: string | null;
  partner_suffix: string | null;
  // Children (up to 5)
  child1_first_name: string | null;
  child1_last_name: string | null;
  child2_first_name: string | null;
  child2_last_name: string | null;
  child3_first_name: string | null;
  child3_last_name: string | null;
  child4_first_name: string | null;
  child4_last_name: string | null;
  child5_first_name: string | null;
  child5_last_name: string | null;
  // Invite counts (used for RSVP mapping)
  total_definitely_invited: string | null;
  total_maybe_invited: string | null;
}

// Common column name variations for auto-mapping
const COLUMN_ALIASES: Record<keyof ColumnMapping, string[]> = {
  first_name: ['first name', 'first_name', 'firstname', 'first', 'given name', 'guest first name', 'name first'],
  last_name: ['last name', 'last_name', 'lastname', 'last', 'surname', 'family name', 'guest last name', 'name last'],
  title: ['title'],
  suffix: ['suffix'],
  email: ['email', 'email address', 'e-mail', 'guest email', 'email_address'],
  phone: ['phone', 'phone number', 'cell', 'cell phone', 'mobile', 'telephone', 'phone_number', 'guest phone'],
  group_label: ['group', 'group label', 'group_label', 'party', 'table', 'category', 'guest group'],
  rsvp_status: ['rsvp', 'rsvp status', 'rsvp_status', 'status', 'response', 'attending'],
  relationship: ['relationship', 'relationship to couple', 'relation'],
  address_line1: ['street address', 'address', 'address line 1', 'address_line1', 'street', 'mailing address'],
  address_line2: ['street address (line 2)', 'address line 2', 'address_line2', 'apt', 'suite', 'unit'],
  city: ['city', 'town'],
  state: ['state', 'state / region', 'state/region', 'region', 'province', 'state_region'],
  zip: ['zip', 'zip code', 'zip / postal code', 'zip/postal code', 'postal code', 'zip_postal_code', 'zipcode'],
  country: ['country'],
  partner_title: ['partner title'],
  partner_first_name: ['partner first name', 'partner_first_name', 'spouse first name', 'plus one first name'],
  partner_last_name: ['partner last name', 'partner_last_name', 'spouse last name', 'plus one last name'],
  partner_suffix: ['partner suffix'],
  child1_first_name: ['child 1 first name', 'child1_first_name', 'kid 1 first name'],
  child1_last_name: ['child 1 last name', 'child1_last_name', 'kid 1 last name'],
  child2_first_name: ['child 2 first name', 'child2_first_name', 'kid 2 first name'],
  child2_last_name: ['child 2 last name', 'child2_last_name', 'kid 2 last name'],
  child3_first_name: ['child 3 first name', 'child3_first_name', 'kid 3 first name'],
  child3_last_name: ['child 3 last name', 'child3_last_name', 'kid 3 last name'],
  child4_first_name: ['child 4 first name', 'child4_first_name', 'kid 4 first name'],
  child4_last_name: ['child 4 last name', 'child4_last_name', 'kid 4 last name'],
  child5_first_name: ['child 5 first name', 'child5_first_name', 'kid 5 first name'],
  child5_last_name: ['child 5 last name', 'child5_last_name', 'kid 5 last name'],
  total_definitely_invited: ['total definitely invited', 'definitely invited', 'total_definitely_invited'],
  total_maybe_invited: ['total maybe invited', 'maybe invited', 'total_maybe_invited'],
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
    first_name: null, last_name: null, title: null, suffix: null,
    email: null, phone: null, group_label: null, rsvp_status: null,
    relationship: null,
    address_line1: null, address_line2: null, city: null, state: null, zip: null, country: null,
    partner_title: null, partner_first_name: null, partner_last_name: null, partner_suffix: null,
    child1_first_name: null, child1_last_name: null,
    child2_first_name: null, child2_last_name: null,
    child3_first_name: null, child3_last_name: null,
    child4_first_name: null, child4_last_name: null,
    child5_first_name: null, child5_last_name: null,
    total_definitely_invited: null, total_maybe_invited: null,
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

    const fields = Object.keys(COLUMN_ALIASES).join(', ');

    const response = await openai.chat.completions.create({
      model: CHAT_MODEL_MINI,
      messages: [
        {
          role: 'system',
          content: `You are a CSV column mapper for wedding guest lists. Given CSV headers, map them to these fields: ${fields}. Return a JSON object mapping each field to the exact CSV header name, or null if no match. If there's a single "Name" column, return it for both first_name and last_name with prefix "__split_name:".`,
        },
        {
          role: 'user',
          content: `CSV headers: ${JSON.stringify(headers)}\n\nReturn ONLY valid JSON, no markdown.`,
        },
      ],
      max_tokens: 500,
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
 *
 * Each CSV row can produce multiple guest records:
 * - Primary guest (First Name / Last Name)
 * - Partner (Partner First Name / Partner Last Name)
 * - Up to 5 children (Child N First Name / Child N Last Name)
 *
 * All members of a party share the same party_id, address, and contact info.
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

      // Count how many guests will be created
      let estimatedGuests = 0;
      for (const row of rows) {
        const getVal = (col: string | null) => {
          if (!col) return '';
          const idx = headers.findIndex((h) => h === col);
          return idx >= 0 ? (row[idx] || '').trim() : '';
        };
        // Primary
        const fn = mapping.first_name?.startsWith('__split_name:')
          ? getVal(mapping.first_name.replace('__split_name:', ''))
          : getVal(mapping.first_name);
        const ln = getVal(mapping.last_name);
        if (fn || ln) estimatedGuests++;
        // Partner
        if (getVal(mapping.partner_first_name) || getVal(mapping.partner_last_name)) estimatedGuests++;
        // Children
        for (let c = 1; c <= 5; c++) {
          const cfn = getVal(mapping[`child${c}_first_name` as keyof ColumnMapping]);
          const cln = getVal(mapping[`child${c}_last_name` as keyof ColumnMapping]);
          if (cfn || cln) estimatedGuests++;
        }
      }

      return Response.json({
        headers,
        mapping,
        preview,
        total_rows: rows.length,
        estimated_guests: estimatedGuests,
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

      const getCell = (row: string[], colName: string | null): string => {
        const idx = headerIndex(colName);
        return idx >= 0 ? (row[idx] || '').trim() : '';
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

      const INSERT_SQL = `INSERT INTO guests (
        wedding_id, first_name, last_name, email, phone, group_label, rsvp_status,
        title, suffix, address_line1, address_line2, city, state, zip, country,
        party_id, party_role, relationship
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id`;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          // Shared fields for the party
          const email = getCell(row, mapping.email) || null;
          const phone = getCell(row, mapping.phone) || null;
          const group = getCell(row, mapping.relationship) || getCell(row, mapping.group_label) || null;
          const addressLine1 = getCell(row, mapping.address_line1) || null;
          const addressLine2 = getCell(row, mapping.address_line2) || null;
          const city = getCell(row, mapping.city) || null;
          const state = getCell(row, mapping.state) || null;
          const zip = getCell(row, mapping.zip) || null;
          const country = getCell(row, mapping.country) || null;
          const relationship = getCell(row, mapping.relationship) || null;

          // Determine RSVP: use rsvp_status column, or infer from "Total Definitely Invited"
          let rsvp: 'pending' | 'attending' | 'declined' = 'pending';
          const rsvpVal = getCell(row, mapping.rsvp_status);
          if (rsvpVal) {
            rsvp = normalizeRsvp(rsvpVal);
          } else {
            const defInvited = getCell(row, mapping.total_definitely_invited);
            if (defInvited && parseInt(defInvited, 10) > 0) {
              rsvp = 'attending';
            }
          }

          // Generate a party_id (UUID) to link all members from this row
          const partyIdResult = await pool.query('SELECT uuid_generate_v4() as id');
          const partyId = partyIdResult.rows[0].id;

          // ── Primary Guest ──
          let primaryFirstName: string;
          let primaryLastName: string;

          if (isSplitName) {
            const nameIdx = headers.findIndex((h) => h === splitNameCol);
            const fullName = (nameIdx >= 0 ? row[nameIdx] : '').trim();
            if (!fullName) {
              skipped++;
              continue;
            }
            const parts = fullName.split(/\s+/);
            primaryFirstName = parts[0] || '';
            primaryLastName = parts.slice(1).join(' ') || '';
            if (!primaryLastName) primaryLastName = primaryFirstName;
          } else {
            primaryFirstName = getCell(row, mapping.first_name);
            primaryLastName = getCell(row, mapping.last_name);
          }

          if (!primaryFirstName && !primaryLastName) {
            skipped++;
            continue;
          }
          if (!primaryFirstName) primaryFirstName = '-';
          if (!primaryLastName) primaryLastName = '-';

          const primaryTitle = getCell(row, mapping.title) || null;
          const primarySuffix = getCell(row, mapping.suffix) || null;

          await pool.query(INSERT_SQL, [
            weddingId, primaryFirstName, primaryLastName, email, phone, group, rsvp,
            primaryTitle, primarySuffix, addressLine1, addressLine2, city, state, zip, country,
            partyId, 'primary', relationship,
          ]);
          imported++;

          // ── Partner ──
          const partnerFirst = getCell(row, mapping.partner_first_name);
          const partnerLast = getCell(row, mapping.partner_last_name);
          if (partnerFirst || partnerLast) {
            const pTitle = getCell(row, mapping.partner_title) || null;
            const pSuffix = getCell(row, mapping.partner_suffix) || null;

            await pool.query(INSERT_SQL, [
              weddingId,
              partnerFirst || '-',
              partnerLast || primaryLastName, // default to primary's last name
              null, null, group, rsvp,
              pTitle, pSuffix, addressLine1, addressLine2, city, state, zip, country,
              partyId, 'partner', relationship,
            ]);
            imported++;
          }

          // ── Children (1-5) ──
          for (let c = 1; c <= 5; c++) {
            const childFirst = getCell(row, mapping[`child${c}_first_name` as keyof ColumnMapping]);
            const childLast = getCell(row, mapping[`child${c}_last_name` as keyof ColumnMapping]);
            if (childFirst || childLast) {
              await pool.query(INSERT_SQL, [
                weddingId,
                childFirst || '-',
                childLast || primaryLastName, // default to primary's last name
                null, null, group, rsvp,
                null, null, addressLine1, addressLine2, city, state, zip, country,
                partyId, 'child', relationship,
              ]);
              imported++;
            }
          }
        } catch (err) {
          errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          skipped++;
        }
      }

      return Response.json({
        imported,
        skipped,
        total: rows.length,
        errors: errors.slice(0, 10),
      }, { status: 201 });
    }

    throw new AppError('VALIDATION_ERROR', 'step must be "preview" or "import"');
  } catch (error) {
    return handleApiError(error);
  }
}
