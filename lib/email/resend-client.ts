import { Resend } from 'resend';
import { env } from '@/lib/env';

/**
 * Resend email client (lazy-initialized so build doesn't fail when key is missing).
 *
 * Free tier: 3,000 emails/month, 100/day.
 *
 * IMPORTANT: Resend requires a verified sender domain. You cannot send directly
 * "from" a Gmail address. Verify your wedding domain (e.g.
 * jaywalkingtojairath.wedding) in the Resend dashboard, then set
 *   RESEND_FROM_EMAIL=no-reply@jaywalkingtojairath.wedding
 *   RESEND_REPLY_TO=shriyaneilwedding@gmail.com
 * so guests' replies still go back to the couple's Gmail inbox.
 * For quick testing only, `onboarding@resend.dev` works but can only send to
 * the Resend account's own verified addresses.
 */
let _resend: Resend | null = null;

export function getResend(): Resend {
  if (_resend) return _resend;
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is not set. Add it to your environment to enable email sending.'
    );
  }
  _resend = new Resend(apiKey);
  return _resend;
}

export function isResendConfigured(): boolean {
  return !!env.RESEND_API_KEY && !!env.RESEND_FROM_EMAIL;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  fromName?: string;
}

export interface SendEmailResult {
  id: string | null;
  error: string | null;
}

/**
 * Send a single email via Resend. Returns { id, error } — never throws so
 * batch senders can continue on partial failures.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  if (!isResendConfigured()) {
    return { id: null, error: 'Resend is not configured' };
  }

  const fromEmail = env.RESEND_FROM_EMAIL!;
  const fromName = opts.fromName || env.RESEND_FROM_NAME || 'Zari';
  const from = `${fromName} <${fromEmail}>`;
  const replyTo = opts.replyTo || env.RESEND_REPLY_TO || undefined;

  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      replyTo,
    });

    if (error) {
      return { id: null, error: error.message || 'Resend returned an error' };
    }
    return { id: data?.id || null, error: null };
  } catch (err) {
    return {
      id: null,
      error: err instanceof Error ? err.message : 'Unknown error sending email',
    };
  }
}

/**
 * Send the same email to many recipients individually (one message per guest
 * so addresses are never exposed to each other). Runs with a small concurrency
 * limit to respect the Resend free-tier rate limits (~2 req/sec).
 */
export async function sendEmailBatch(
  recipients: Array<{ email: string; name?: string }>,
  template: { subject: string; html: string; text?: string },
  opts: { replyTo?: string; fromName?: string; concurrency?: number } = {}
): Promise<{
  sent: number;
  failed: number;
  results: Array<{ email: string; id: string | null; error: string | null }>;
}> {
  const concurrency = opts.concurrency ?? 2;
  const results: Array<{ email: string; id: string | null; error: string | null }> = [];
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += concurrency) {
    const chunk = recipients.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (recipient) => {
        const result = await sendEmail({
          to: recipient.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          replyTo: opts.replyTo,
          fromName: opts.fromName,
        });
        return { email: recipient.email, ...result };
      })
    );
    for (const r of chunkResults) {
      results.push(r);
      if (r.error) failed += 1;
      else sent += 1;
    }
    // Small delay to stay comfortably under Resend's 2 req/s free-tier cap
    if (i + concurrency < recipients.length) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  return { sent, failed, results };
}
