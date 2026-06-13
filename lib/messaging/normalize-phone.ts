/**
 * Phone normalization to E.164 for SMS sending and clipboard export into
 * WhatsApp/SMS group-add fields.
 *
 * We can't validate against the actual carrier — that requires libphonenumber,
 * a ~600kb dep we don't want for a copy-button and a broadcast field. Instead
 * this is a deliberately permissive heuristic with a configurable assumption
 * for numbers that were typed without a country code.
 *
 * `defaultCallingCode` controls how a number with no leading `+` is read:
 *
 *   '1'  (default) — North American Numbering Plan. A bare 10-digit number
 *         becomes +1XXXXXXXXXX, and an 11-digit number starting with 1 becomes
 *         +1XXXXXXXXXX. This is the right assumption for a US/Canada guest
 *         list, where people habitually store "8122490769" with no +1.
 *   '44', '34', … — assume that country. A single leading trunk-0 is stripped
 *         first, so a UK "07700 900123" becomes +447700900123.
 *   null — strict: never guess. A national-looking number with no country code
 *         is flagged 'ambiguous_no_country' so the caller can ask the user to
 *         fix it.
 *
 * Non-destructive by design: callers normalize on read/send and never rewrite
 * the stored value, so a wrong guess is corrected simply by editing the
 * guest's number (e.g. adding +44) — that explicit country code always wins.
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

export function normalizePhone(
  raw: string | null | undefined,
  defaultCallingCode: string | null = '1'
): NormalizeResult {
  if (!raw) return { ok: false, reason: 'empty' };

  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (cleaned.length === 0) return { ok: false, reason: 'empty' };

  // Explicit country code always wins, regardless of the default.
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (!/^\d+$/.test(digits)) return { ok: false, reason: 'too_short' };
    if (digits.length < 7) return { ok: false, reason: 'too_short' };
    return { ok: true, e164: `+${digits}` };
  }

  if (!/^\d+$/.test(cleaned)) return { ok: false, reason: 'too_short' };

  // No '+'. Interpret based on the configured default country.
  if (defaultCallingCode === '1') {
    // NANP: a complete national number is exactly 10 digits.
    if (cleaned.length === 10) return { ok: true, e164: `+1${cleaned}` };
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return { ok: true, e164: `+${cleaned}` };
    }
    // 12+ digits (or 11 not starting with 1) is already an international
    // number typed without its '+' — keep it rather than forcing +1.
    if (cleaned.length >= 11) return { ok: true, e164: `+${cleaned}` };
    // 7-9 digits can't be a complete NANP number.
    return { ok: false, reason: 'too_short' };
  }

  if (defaultCallingCode) {
    // Already leads with this country's code and is long enough → full
    // international number typed without '+'.
    if (cleaned.length >= 11 && cleaned.startsWith(defaultCallingCode)) {
      return { ok: true, e164: `+${cleaned}` };
    }
    // Otherwise treat as a national number: drop a single trunk-0 prefix and
    // prepend the calling code.
    const national = cleaned.replace(/^0+/, '');
    if (national.length < 6) return { ok: false, reason: 'too_short' };
    return { ok: true, e164: `+${defaultCallingCode}${national}` };
  }

  // Strict mode: never guess a country.
  if (cleaned.length >= 11) return { ok: true, e164: `+${cleaned}` };
  if (cleaned.length >= 7) return { ok: false, reason: 'ambiguous_no_country' };
  return { ok: false, reason: 'too_short' };
}
