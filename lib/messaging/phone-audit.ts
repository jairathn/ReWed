/**
 * "Review international numbers" audit.
 *
 * normalizePhone() defaults a number with no country code to US (+1) — the
 * right call for a mostly-US guest list, but a silent trap for international
 * guests: an Indian mobile like "9876543210" is also 10 digits, so it becomes
 * +19876543210 and texts there go nowhere.
 *
 * This audit flags exactly those cases: a number that (a) was typed WITHOUT an
 * explicit country code, and (b) got the +1 default, but (c) whose area code
 * isn't an assigned NANP area code — so it's almost certainly a foreign number
 * the couple should give a real country code. Numbers with an explicit "+" are
 * trusted (the couple stated the country); numbers that don't normalize at all
 * are a separate "malformed" problem surfaced elsewhere.
 *
 * Heuristic, not perfect: a foreign number whose first three digits happen to
 * collide with a real US area code can't be told apart and won't be flagged.
 * That's acceptable — this catches the common, fixable mistakes.
 */
import { normalizePhone } from './normalize-phone';
import { isNanpAreaCode } from './nanp-area-codes';

export interface PhoneAuditResult {
  /** The number looks like it was wrongly defaulted to +1. */
  suspicious: boolean;
  /** What normalizePhone produced, for showing the couple the bad guess. */
  e164?: string;
}

export function auditPhone(raw: string | null | undefined): PhoneAuditResult {
  if (!raw) return { suspicious: false };

  const cleaned = raw.replace(/[\s\-().]/g, '');
  // Explicit country code → the couple stated the country, trust it.
  if (cleaned.startsWith('+')) return { suspicious: false };

  const norm = normalizePhone(raw); // default '1'
  // Didn't normalize (too short / junk) → handled as "malformed", not here.
  if (!norm.ok || !norm.e164) return { suspicious: false };

  // Only +1 defaults are candidates. A long number we kept as international
  // (e.g. "919876543210" → +91…) already escaped the +1 default.
  if (!norm.e164.startsWith('+1')) return { suspicious: false };

  const national = norm.e164.slice(2); // strip "+1"
  if (national.length !== 10) return { suspicious: false };

  const areaCode = national.slice(0, 3);
  if (isNanpAreaCode(areaCode)) return { suspicious: false };

  return { suspicious: true, e164: norm.e164 };
}
