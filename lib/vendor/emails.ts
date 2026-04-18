import type { Pool } from 'pg';
import { sendEmail, isResendConfigured } from '@/lib/email/resend-client';
import { buildGuestEmail } from '@/lib/email/templates';

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function logEmail(
  pool: Pool,
  args: {
    weddingId: string;
    vendorId: string | null;
    recipient: string;
    subject: string;
    emailType: string;
    resendId: string | null;
  }
) {
  await pool.query(
    `INSERT INTO vendor_email_log
       (wedding_id, vendor_id, recipient_email, subject, email_type, resend_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [args.weddingId, args.vendorId, args.recipient, args.subject, args.emailType, args.resendId]
  );
}

/**
 * Send an email to the couple when a vendor posts a comment or proposed
 * change. Subject is prefixed "From [Vendor name]" per spec. Honors the
 * couple-configured notification_email, falling back to a default.
 */
export async function sendVendorProposalEmail(
  pool: Pool,
  args: {
    weddingId: string;
    weddingName: string;
    vendorId: string;
    vendorName: string;
    vendorEmail: string | null;
    notificationEmail: string;
    comment: string;
    proposedChange: string | null;
    entryDescription: string | null;
  }
): Promise<{ sent: boolean; error: string | null }> {
  if (!isResendConfigured()) {
    await logEmail(pool, {
      weddingId: args.weddingId,
      vendorId: args.vendorId,
      recipient: args.notificationEmail,
      subject: `From ${args.vendorName} — [not sent: Resend not configured]`,
      emailType: 'vendor_proposal',
      resendId: null,
    });
    return { sent: false, error: 'Resend is not configured' };
  }

  const snippet = args.comment.slice(0, 60).replace(/\s+/g, ' ').trim();
  const subject = `From ${args.vendorName} — ${snippet}${args.comment.length > 60 ? '…' : ''}`;

  const bodyParts: string[] = [];
  if (args.entryDescription) {
    bodyParts.push(`About this entry: ${args.entryDescription}`);
  }
  bodyParts.push(`Comment:\n${args.comment}`);
  if (args.proposedChange) {
    bodyParts.push(`Proposed change:\n${args.proposedChange}`);
  }
  bodyParts.push(`From: ${args.vendorName}${args.vendorEmail ? ` <${args.vendorEmail}>` : ''}`);

  const { html, text } = buildGuestEmail({
    weddingName: args.weddingName,
    heading: `New message from ${args.vendorName}`,
    body: bodyParts.join('\n\n'),
    footerNote: 'This came through the ReWed vendor portal. Reply directly to respond to the vendor.',
  });

  const result = await sendEmail({
    to: args.notificationEmail,
    subject,
    html,
    text,
    replyTo: args.vendorEmail || undefined,
    fromName: `${args.vendorName} via ReWed`,
  });

  await logEmail(pool, {
    weddingId: args.weddingId,
    vendorId: args.vendorId,
    recipient: args.notificationEmail,
    subject,
    emailType: 'vendor_proposal',
    resendId: result.id,
  });

  return { sent: !result.error, error: result.error };
}

/**
 * Notify a vendor that one of their assigned timeline entries was updated.
 * No-op when the vendor has no email on file.
 */
export async function sendTimelineChangeEmail(
  pool: Pool,
  args: {
    weddingId: string;
    weddingName: string;
    vendorId: string;
    vendorName: string;
    vendorEmail: string | null;
    portalUrl: string;
    changeSummary: string;
    entryDescription: string;
  }
): Promise<{ sent: boolean; error: string | null }> {
  if (!args.vendorEmail) return { sent: false, error: 'Vendor has no email on file' };
  if (!isResendConfigured()) return { sent: false, error: 'Resend is not configured' };

  const subject = `Timeline update — ${args.entryDescription}`;
  const { html, text } = buildGuestEmail({
    weddingName: args.weddingName,
    guestName: args.vendorName,
    heading: 'A timeline entry you\'re on just changed',
    body: `${args.entryDescription}\n\nWhat changed:\n${args.changeSummary}`,
    ctaLabel: 'Open your vendor page',
    ctaUrl: args.portalUrl,
    footerNote: 'Only entries you\'re assigned to trigger a note. Reply with questions anytime.',
  });

  const result = await sendEmail({
    to: args.vendorEmail,
    subject,
    html,
    text,
    fromName: `${args.weddingName} via ReWed`,
  });

  await logEmail(pool, {
    weddingId: args.weddingId,
    vendorId: args.vendorId,
    recipient: args.vendorEmail,
    subject,
    emailType: 'timeline_update',
    resendId: result.id,
  });

  return { sent: !result.error, error: result.error };
}

/**
 * Build a human-readable change summary by diffing two timeline-entry
 * snapshots. Returns null if nothing meaningful changed.
 */
export function diffTimelineEntry(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string | null {
  const fields: Array<{ key: string; label: string }> = [
    { key: 'time_label', label: 'Time' },
    { key: 'action', label: 'Action' },
    { key: 'location', label: 'Location' },
    { key: 'notes', label: 'Notes' },
    { key: 'status', label: 'Status' },
  ];
  const lines: string[] = [];
  for (const f of fields) {
    const a = (before[f.key] ?? '') as string;
    const b = (after[f.key] ?? '') as string;
    if (a !== b) {
      lines.push(`• ${f.label}: "${escape(a || '—')}" → "${escape(b || '—')}"`);
    }
  }
  return lines.length > 0 ? lines.join('\n') : null;
}
