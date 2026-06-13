/**
 * Validation for the send time of a scheduled SMS.
 *
 * Twilio's native scheduling requires SendAt to be at least 15 minutes and at
 * most 35 days in the future. We validate the same window so the couple gets a
 * friendly message instead of a raw Twilio rejection, and we apply a small
 * grace below 15 min to absorb clock skew + the round-trip between the
 * browser picking a time and the server receiving it (Twilio remains the final
 * gate).
 */

export const MIN_LEAD_MS = 15 * 60 * 1000; // 15 minutes
export const MAX_LEAD_MS = 35 * 24 * 60 * 60 * 1000; // 35 days
const GRACE_MS = 60 * 1000; // 1 minute of slack on the lower bound

export interface SendAtValidation {
  ok: boolean;
  /** Parsed instant, only when ok. */
  date?: Date;
  error?: string;
}

/**
 * @param sendAtIso  ISO-8601 instant (UTC) from the client
 * @param now        injectable for tests; defaults to current time
 */
export function validateSendAt(sendAtIso: string, now: Date = new Date()): SendAtValidation {
  const date = new Date(sendAtIso);
  if (isNaN(date.getTime())) {
    return { ok: false, error: 'Invalid date' };
  }

  const lead = date.getTime() - now.getTime();
  if (lead < MIN_LEAD_MS - GRACE_MS) {
    return { ok: false, error: 'Scheduled time must be at least 15 minutes from now' };
  }
  if (lead > MAX_LEAD_MS) {
    return { ok: false, error: 'Scheduled time cannot be more than 35 days from now' };
  }
  return { ok: true, date };
}
