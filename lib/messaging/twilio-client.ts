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

export interface SendSmsResult {
  sid: string | null;
  error: string | null;
}

// Friendlier text for the Twilio error codes a wedding couple is most
// likely to hit, keyed by https://www.twilio.com/docs/api/errors
const ERROR_HINTS: Record<number, string> = {
  21211: 'Invalid phone number',
  21408: 'SMS not enabled for this region on your Twilio account',
  21610: 'This guest replied STOP and carriers block further texts to them',
  21614: 'Not a mobile number (landline?)',
  30032: 'Toll-free number not yet verified — finish verification in the Twilio console',
};

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
