import { randomBytes } from 'crypto';
import type { Pool } from 'pg';
import type { ParsedExcel, ParsedVendor } from './excel-parser';

function generateAccessToken(): string {
  return randomBytes(24).toString('hex');
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Upsert vendors by normalized name so access tokens survive re-uploads.
 * Returns a map keyed by normalized vendor name → vendor row.
 */
async function upsertVendors(
  pool: Pool,
  weddingId: string,
  parsedVendors: ParsedVendor[]
): Promise<Map<string, { id: string; name: string; normalized: string }>> {
  const existing = await pool.query(
    `SELECT id, name, company FROM vendors WHERE wedding_id = $1`,
    [weddingId]
  );
  const existingByNorm = new Map<string, { id: string; name: string }>();
  for (const row of existing.rows) {
    existingByNorm.set(normalizeName(row.name), { id: row.id, name: row.name });
    if (row.company && row.company !== row.name) {
      existingByNorm.set(normalizeName(row.company), { id: row.id, name: row.name });
    }
  }

  const result = new Map<string, { id: string; name: string; normalized: string }>();

  for (const v of parsedVendors) {
    const norm = normalizeName(v.name);
    const existingRow = existingByNorm.get(norm);

    if (existingRow) {
      await pool.query(
        `UPDATE vendors
         SET category = $1, company = $2, deposit_status = $3, notes = $4, updated_at = NOW()
         WHERE id = $5`,
        [v.category, v.company, v.deposit_status, v.notes, existingRow.id]
      );
      result.set(norm, { id: existingRow.id, name: existingRow.name, normalized: norm });
    } else {
      const token = generateAccessToken();
      const ins = await pool.query(
        `INSERT INTO vendors (wedding_id, name, company, category, deposit_status, notes, access_token)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name`,
        [weddingId, v.name, v.company, v.category, v.deposit_status, v.notes, token]
      );
      result.set(norm, { id: ins.rows[0].id, name: ins.rows[0].name, normalized: norm });
    }
  }

  return result;
}

/**
 * Match a free-form vendor reference from the timeline (e.g. "Jas Johal" or
 * "Saima (Henna)") to one of the known vendor records. Returns the vendor id
 * or null if no confident match.
 */
function matchVendor(
  reference: string,
  vendorMap: Map<string, { id: string; name: string; normalized: string }>
): string | null {
  const norm = normalizeName(reference);
  if (!norm) return null;

  const exact = vendorMap.get(norm);
  if (exact) return exact.id;

  // Substring match: vendor name appears in reference or vice versa
  for (const [key, v] of vendorMap) {
    if (norm.includes(key) || key.includes(norm)) return v.id;
  }
  return null;
}

export async function syncTimelineFromParsedExcel(
  pool: Pool,
  weddingId: string,
  parsed: ParsedExcel
): Promise<{ vendorCount: number; entryCount: number; unmatchedVendors: string[] }> {
  const vendorMap = await upsertVendors(pool, weddingId, parsed.vendors);

  // Persist emergency contacts to wedding config so they appear on vendor views
  if (parsed.emergencyContacts.length > 0) {
    await pool.query(
      `UPDATE weddings
       SET config = jsonb_set(
         COALESCE(config, '{}'::jsonb),
         '{emergency_contacts}',
         $1::jsonb
       )
       WHERE id = $2`,
      [JSON.stringify(parsed.emergencyContacts), weddingId]
    );
  }

  // Wipe existing timeline for a clean re-sync.
  await pool.query(`DELETE FROM timeline_entries WHERE wedding_id = $1`, [weddingId]);

  const unmatched = new Set<string>();

  for (const entry of parsed.timeline) {
    const ins = await pool.query(
      `INSERT INTO timeline_entries (
         wedding_id, event_date, event_name, time_label, sort_order,
         action, location, notes, status, deadline
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        weddingId,
        entry.event_date,
        entry.event_name,
        entry.time_label,
        entry.sort_order,
        entry.action,
        entry.location,
        entry.notes,
        entry.status,
        entry.deadline,
      ]
    );
    const entryId = ins.rows[0].id;

    for (const vendorName of entry.vendor_names) {
      const vendorId = matchVendor(vendorName, vendorMap);
      if (vendorId) {
        await pool.query(
          `INSERT INTO timeline_entry_vendors (timeline_entry_id, vendor_id, role)
           VALUES ($1, $2, 'owner')
           ON CONFLICT DO NOTHING`,
          [entryId, vendorId]
        );
      } else {
        unmatched.add(vendorName);
      }
    }
  }

  return {
    vendorCount: vendorMap.size,
    entryCount: parsed.timeline.length,
    unmatchedVendors: Array.from(unmatched),
  };
}
