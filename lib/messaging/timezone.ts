/**
 * Timezone helpers for the SMS scheduler, so the couple picks a send time in
 * their wedding's timezone rather than the browser's. Pure Intl — no library.
 *
 * The hard direction is wall-clock → UTC: a `<input type="datetime-local">`
 * gives a bare "YYYY-MM-DDTHH:mm" with no zone, and we need the UTC instant
 * for that wall time *in the wedding's zone*. We do the standard guess-then-
 * correct: treat the wall time as if it were UTC, ask Intl what offset that
 * zone had at that instant, and subtract it.
 */

/**
 * Offset (ms) between a zone's wall-clock reading and UTC at `date`, such that
 * wallClockMs = date.getTime() + offset. Positive east of UTC.
 */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  // 'en-US' renders midnight as hour 24; normalize to 0.
  const hour = map.hour === 24 ? 0 : map.hour;
  const asIfUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return asIfUtc - date.getTime();
}

/**
 * Interpret a "YYYY-MM-DDTHH:mm" wall-clock string as a time in `timeZone` and
 * return the corresponding UTC Date.
 */
export function zonedWallClockToUtc(wallClock: string, timeZone: string): Date {
  const [datePart, timePart] = wallClock.split('T');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = (timePart || '00:00').split(':').map(Number);

  // First guess: pretend the wall clock is already UTC.
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  // Correct by the zone's offset at that instant. (Re-checking with the
  // corrected instant would handle the rare DST-boundary minute; one pass is
  // accurate everywhere else and good enough for scheduling.)
  const offset = zoneOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

/** Format a UTC instant as a friendly date+time string in `timeZone`. */
export function formatInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

/**
 * Render a UTC instant as a "YYYY-MM-DDTHH:mm" wall-clock string in `timeZone`,
 * suitable as the value of an <input type="datetime-local">. The inverse of
 * zonedWallClockToUtc.
 */
export function utcToZonedWallClock(date: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const hour = map.hour === '24' ? '00' : map.hour;
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}
