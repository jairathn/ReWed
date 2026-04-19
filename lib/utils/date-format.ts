/**
 * Shared date formatting helpers.
 *
 * Postgres returns `DATE` columns as JS `Date` at UTC midnight. JSON.stringify
 * turns those into ISO strings like "2026-09-11T00:00:00.000Z". Appending a
 * time suffix to such a string produces "Invalid Date", which is the bug the
 * vendor portal was hitting everywhere.
 *
 * `normalizeDate` reduces any date-like value to a bare "YYYY-MM-DD" string so
 * the formatters below can safely build a local-noon Date without timezone
 * surprises.
 */

export function normalizeDate(date: unknown): string | null {
  if (!date) return null;
  if (date instanceof Date) {
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }
  const s = String(date).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.includes('T')) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toLocalNoon(date: unknown): Date | null {
  const ds = normalizeDate(date);
  if (!ds) return null;
  const d = new Date(ds + 'T12:00:00');
  return isNaN(d.getTime()) ? null : d;
}

export function formatLongDate(
  date: unknown,
  opts: { timezone?: string; fallback?: string } = {}
): string {
  const d = toLocalNoon(date);
  if (!d) return opts.fallback ?? '';
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: opts.timezone,
  });
}

export function formatShortDate(
  date: unknown,
  opts: { timezone?: string; fallback?: string } = {}
): string {
  const d = toLocalNoon(date);
  if (!d) return opts.fallback ?? '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: opts.timezone,
  });
}

export function formatWeekdayShort(
  date: unknown,
  opts: { timezone?: string; fallback?: string } = {}
): string {
  const d = toLocalNoon(date);
  if (!d) return opts.fallback ?? '';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: opts.timezone,
  });
}

export function formatDayHeader(
  date: unknown,
  opts: { timezone?: string; fallback?: string } = {}
): string {
  const d = toLocalNoon(date);
  if (!d) return opts.fallback ?? '';
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: opts.timezone,
  });
}

export function daysUntil(date: unknown): number | null {
  const d = toLocalNoon(date);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = d.getTime() - today.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}
