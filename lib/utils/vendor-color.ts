/**
 * Stable per-vendor color derived from the vendor id, so the same vendor
 * renders identically in the couple timeline filter bar, on every row, and
 * in the vendor portal's master timeline. Scanning "who does what" is the
 * whole point of these views.
 */

const VENDOR_COLORS = [
  '#C4704B', // terracotta
  '#2B5F8A', // mediterranean blue
  '#7A8B5C', // olive
  '#D4A853', // golden
  '#A8883F', // gold-dark
  '#9B6B1F', // amber
  '#8F4C6B', // plum
  '#3F7A6B', // teal
  '#8A5A2B', // walnut
  '#5A6F8F', // slate blue
];

export function vendorColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return VENDOR_COLORS[Math.abs(hash) % VENDOR_COLORS.length];
}

/**
 * When a vendor lacks a stable id (e.g. the master timeline surfaces vendor
 * *names* from an aggregate query), hash the name instead so the color is
 * still consistent within a session.
 */
export function vendorColorByName(name: string): string {
  return vendorColor(name.toLowerCase().trim());
}

/**
 * Event colors tied to the --event-* tokens in globals.css so the dashboard
 * schedule reads the same way as the guest schedule. Common Indian wedding
 * event names match by keyword; everything else falls back to the stable
 * hashed palette so no event card is ever colorless.
 */
const EVENT_KEYWORD_COLORS: Array<[RegExp, string]> = [
  [/\bhaldi\b/i, '#D4A853'],
  [/\bmehndi\b/i, '#D4A853'],
  [/\bsangeet\b/i, '#E8865A'],
  [/\bbaraat\b/i, '#E8865A'],
  [/\bwelcome\b/i, '#E8865A'],
  [/\bceremony\b/i, '#2B5F8A'],
  [/\bwedding\b/i, '#2B5F8A'],
  [/\bpheras?\b/i, '#2B5F8A'],
  [/\bnikah\b/i, '#2B5F8A'],
  [/\breception\b/i, '#7A8B5C'],
  [/\bafter[- ]?party\b/i, '#7A8B5C'],
  [/\bbrunch\b/i, '#7A8B5C'],
];

export function eventColorByName(name: string | null | undefined): string {
  if (!name) return vendorColor('event');
  for (const [re, color] of EVENT_KEYWORD_COLORS) {
    if (re.test(name)) return color;
  }
  return vendorColorByName(name);
}
