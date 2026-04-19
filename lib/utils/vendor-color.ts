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
