import { env } from '@/lib/env';

/**
 * Twilio SMS client (plain REST via fetch — the `twilio` npm package is a
 * ~1MB dep we don't need for one endpoint).
 *
 * Setup (one-time, ~15 min + carrier verification wait):
 *   1. Create a Twilio account, buy a toll-free number (~$2/mo).
 *   2. Submit toll-free verification in the Twilio console (free, required
 *      by US carriers before unfiltered sending; approval takes days to ~2
 *      weeks, so do this early).
 *   3. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 *      (E.164, e.g. +18445551234). If you later move to a Messaging
 *      Service, set TWILIO_MESSAGING_SERVICE_SID instead of the number.
 *
 * Carrier-enforced behavior we cannot change: a recipient who replies STOP
 * is blocked at Twilio's edge and future sends to them fail with code
 * 21610. There is no opt-in step — guests just receive the texts.
 */

export function isTwilioConfigured(): boolean {
  return (
    !!env.TWILIO_ACCOUNT_SID &&
    !!env.TWILIO_AUTH_TOKEN &&
    (!!env.TWILIO_PHONE_NUMBER || !!env.TWILIO_MESSAGING_SERVICE_SID) &&
    env.ENABLE_SMS !== 'false'
  );
}

/**
 * Scheduling is only possible through a Messaging Service — Twilio requires
 * MessagingServiceSid (not a plain From number) for ScheduleType=fixed. So the
 * Schedule UI is gated on this being configured, separately from send-now.
 */
export function canScheduleSms(): boolean {
  return isTwilioConfigured() && !!env.TWILIO_MESSAGING_SERVICE_SID;
}

export interface SendSmsResult {
  sid: string | null;
  error: string | null;
}

// Friendlier text for the Twilio error codes a wedding couple is most
// likely to hit, keyed by https://www.twilio.com/docs/api/errors
const ERROR_HINTS: Record<number, string> = {
  20003: 'Twilio rejected the account credentials — check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your environment',
  21211: 'Invalid phone number',
  21408: 'SMS not enabled for this region on your Twilio account',
  21610: 'This guest replied STOP and carriers block further texts to them',
  21614: 'Not a mobile number (landline?)',
  30032: 'Toll-free number not yet verified — finish verification in the Twilio console',
};

/**
 * Cheaply check whether the configured credentials actually work, by fetching
 * the Account resource. Returns:
 *   valid: true  — Twilio accepted the SID + token
 *   valid: false — Twilio rejected them (error explains why)
 *   valid: null  — couldn't reach Twilio (network/timeout) — unknown, don't
 *                  cry wolf in the UI on a transient blip
 *
 * This backs the "configured" banner so it reflects reality, not just the
 * presence of env vars.
 */
export async function validateTwilioCredentials(): Promise<{
  valid: boolean | null;
  error: string | null;
}> {
  if (!isTwilioConfigured()) return { valid: false, error: 'Twilio is not configured' };

  const accountSid = env.TWILIO_ACCOUNT_SID!;
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      {
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${accountSid}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (res.ok) return { valid: true, error: null };

    const data = await res.json().catch(() => null);
    const code: number | undefined = data?.code;
    const hint = code !== undefined ? ERROR_HINTS[code] : undefined;
    return {
      valid: false,
      error: hint || data?.message || `Twilio returned HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      valid: null,
      error: err instanceof Error ? err.message : 'Could not reach Twilio',
    };
  }
}

/**
 * Send a single SMS. Returns { sid, error } — never throws so batch
 * senders can continue on partial failures (mirrors sendEmail).
 */
export async function sendSms(opts: { to: string; body: string }): Promise<SendSmsResult> {
  if (!isTwilioConfigured()) {
    return { sid: null, error: 'Twilio is not configured' };
  }

  const accountSid = env.TWILIO_ACCOUNT_SID!;
  const params = new URLSearchParams({ To: opts.to, Body: opts.body });
  if (env.TWILIO_MESSAGING_SERVICE_SID) {
    params.set('MessagingServiceSid', env.TWILIO_MESSAGING_SERVICE_SID);
  } else {
    params.set('From', env.TWILIO_PHONE_NUMBER!);
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${accountSid}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const code: number | undefined = data?.code;
      const hint = code !== undefined ? ERROR_HINTS[code] : undefined;
      return {
        sid: null,
        error: hint || data?.message || `Twilio returned HTTP ${res.status}`,
      };
    }
    return { sid: data?.sid || null, error: null };
  } catch (err) {
    return {
      sid: null,
      error: err instanceof Error ? err.message : 'Unknown error sending SMS',
    };
  }
}

/**
 * Schedule a single SMS for future delivery via Twilio (ScheduleType=fixed).
 * Requires a Messaging Service — see canScheduleSms(). `sendAt` is an absolute
 * instant; Twilio wants it as ISO-8601 (UTC) and enforces the 15-min/35-day
 * window itself, on top of our own validation. Returns { sid, error } and
 * never throws, matching sendSms so batch schedulers continue on partials.
 */
export async function scheduleSms(opts: {
  to: string;
  body: string;
  sendAt: Date;
}): Promise<SendSmsResult> {
  if (!canScheduleSms()) {
    return { sid: null, error: 'Scheduling requires a Twilio Messaging Service' };
  }

  const accountSid = env.TWILIO_ACCOUNT_SID!;
  const params = new URLSearchParams({
    To: opts.to,
    Body: opts.body,
    MessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID!,
    ScheduleType: 'fixed',
    SendAt: opts.sendAt.toISOString(),
  });

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${accountSid}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const code: number | undefined = data?.code;
      const hint = code !== undefined ? ERROR_HINTS[code] : undefined;
      return {
        sid: null,
        error: hint || data?.message || `Twilio returned HTTP ${res.status}`,
      };
    }
    return { sid: data?.sid || null, error: null };
  } catch (err) {
    return {
      sid: null,
      error: err instanceof Error ? err.message : 'Unknown error scheduling SMS',
    };
  }
}

/**
 * Cancel a scheduled message by SID (POST Status=canceled). Works only while
 * the message is still 'scheduled' — once Twilio hands it to the carrier it
 * can't be recalled. Returns an error string on failure, null on success.
 */
export async function cancelScheduledSms(messageSid: string): Promise<string | null> {
  if (!isTwilioConfigured()) return 'Twilio is not configured';

  const accountSid = env.TWILIO_ACCOUNT_SID!;
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageSid}.json`,
      {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${accountSid}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ Status: 'canceled' }).toString(),
      }
    );
    if (res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.message || `Twilio returned HTTP ${res.status}`;
  } catch (err) {
    return err instanceof Error ? err.message : 'Unknown error canceling SMS';
  }
}
