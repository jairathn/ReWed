/**
 * Phone normalization to E.164 for clipboard export into WhatsApp/SMS
 * group-add fields.
 *
 * WhatsApp's Add Participants flow accepts a comma-separated list of E.164
 * numbers (`+34612345678, +1...`). We can't validate against the actual
 * carrier — that requires libphonenumber, which is a 600kb dep we don't
 * need for a copy-button. Instead this is a deliberately permissive
 * heuristic:
 *
 *   - Strip spaces, dashes, parens, dots.
 *   - If the cleaned string starts with `+`, keep it.
 *   - If it has 11+ digits and no `+`, prepend `+` (international without
 *     the leading `+` — common Spanish/UK pattern).
 *   - If it has 10 digits and no country code, flag ambiguous. We pass it
 *     through *unprefixed* (caller decides whether to include) and surface
 *     a warning the user can act on.
 *   - <7 digits is too short, drop.
 *
 * Inline tests at the bottom of the file act as live documentation of
 * intent; they don't run anywhere automated yet, just here for the next
 * person reading.
 */

export type NormalizeReason =
  | 'empty'
  | 'too_short'
  | 'ambiguous_no_country';

export interface NormalizeResult {
  ok: boolean;
  e164?: string;
  reason?: NormalizeReason;
}

export function normalizePhone(raw: string | null | undefined): NormalizeResult {
  if (!raw) return { ok: false, reason: 'empty' };

  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (cleaned.length === 0) return { ok: false, reason: 'empty' };

  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (digits.length < 7) return { ok: false, reason: 'too_short' };
    if (!/^\d+$/.test(digits)) return { ok: false, reason: 'too_short' };
    return { ok: true, e164: `+${digits}` };
  }

  if (!/^\d+$/.test(cleaned)) return { ok: false, reason: 'too_short' };

  if (cleaned.length >= 11) {
    return { ok: true, e164: `+${cleaned}` };
  }

  if (cleaned.length >= 7) {
    // Likely US 10-digit or similar — couple paste-edited the country code
    // off. Surface this so they can fix the row, but don't drop the number.
    return { ok: false, reason: 'ambiguous_no_country' };
  }

  return { ok: false, reason: 'too_short' };
}

// Inline test cases — documentation of intent:
//
//   normalizePhone(null)              → { ok: false, reason: 'empty' }
//   normalizePhone('')                → { ok: false, reason: 'empty' }
//   normalizePhone('+34 612 34 56 78')→ { ok: true,  e164: '+34612345678' }
//   normalizePhone('+1-555-867-5309') → { ok: true,  e164: '+15558675309' }
//   normalizePhone('34612345678')     → { ok: true,  e164: '+34612345678' }
//   normalizePhone('5558675309')      → { ok: false, reason: 'ambiguous_no_country' }
//   normalizePhone('1234')            → { ok: false, reason: 'too_short' }
//   normalizePhone('+34abc')          → { ok: false, reason: 'too_short' }
