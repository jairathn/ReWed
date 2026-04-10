'use client';

import { useState, useEffect, use } from 'react';

type Audience = 'all' | 'attending' | 'pending' | 'declined';

interface EmailStatus {
  configured: boolean;
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  counts: {
    total: number;
    with_email: number;
    attending: number;
    pending: number;
    declined: number;
  };
}

interface SendResult {
  sent: number;
  failed: number;
  total?: number;
  skipped?: number;
  message?: string;
  errors?: Array<{ email: string; error: string }>;
}

const templates: Array<{
  id: string;
  label: string;
  subject: string;
  heading: string;
  body: string;
  cta_label?: string;
}> = [
  {
    id: 'rsvp-reminder',
    label: 'RSVP Reminder',
    subject: "Don't forget to RSVP",
    heading: 'A gentle RSVP reminder',
    body: "We haven't heard from you yet and we'd love to know if you can make it!\n\nPlease take a moment to let us know whether you'll be joining us — it helps us finalize plans.\n\nWith love,\nThe happy couple",
    cta_label: 'RSVP now',
  },
  {
    id: 'save-the-date',
    label: 'Save the Date',
    subject: 'Save the date — our wedding is coming up!',
    heading: 'Save the date',
    body: "We're so excited to celebrate with you. The big day is getting closer, and we wanted to make sure it's on your calendar.\n\nMore details coming soon — keep an eye on your inbox and our wedding page.",
    cta_label: 'View details',
  },
  {
    id: 'thank-you',
    label: 'Thank You',
    subject: 'Thank you for celebrating with us',
    heading: 'Thank you, from the bottom of our hearts',
    body: "Thank you so much for being part of our special day. Having you there meant the world to us.\n\nWe're so grateful for your love, support, and the wonderful memories we made together.",
  },
  {
    id: 'custom',
    label: 'Custom',
    subject: '',
    heading: '',
    body: '',
  },
];

export default function EmailsPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [audience, setAudience] = useState<Audience>('all');
  const [subject, setSubject] = useState('');
  const [heading, setHeading] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [replyTo, setReplyTo] = useState('');

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [sendError, setSendError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/dashboard/weddings/${weddingId}/emails/status`)
      .then((res) => res.json())
      .then((data) => setStatus(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [weddingId]);

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setHeading(t.heading);
    setBody(t.body);
    setCtaLabel(t.cta_label || '');
  };

  const audienceCount =
    status?.counts[
      audience === 'all'
        ? 'with_email'
        : (audience as 'attending' | 'pending' | 'declined')
    ] ?? 0;

  const canSend =
    !!status?.configured &&
    !sending &&
    subject.trim().length > 0 &&
    heading.trim().length > 0 &&
    body.trim().length > 0 &&
    audienceCount > 0;

  const handleSend = async () => {
    setSending(true);
    setSendError('');
    setResult(null);
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/emails/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          heading: heading.trim(),
          body: body.trim(),
          cta_label: ctaLabel.trim() || undefined,
          cta_url: ctaUrl.trim() || undefined,
          audience,
          reply_to: replyTo.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data?.error?.message || data?.message || 'Failed to send');
      } else {
        setResult(data);
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 180, height: 32, marginBottom: 16, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: '100%', height: 400, borderRadius: 16 }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
          Email Guests
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>
          Send reminders, updates, and thank-yous to your guest list.
        </p>
      </div>

      {/* Not configured banner */}
      {!status?.configured && (
        <div
          style={{
            padding: 20,
            borderRadius: 16,
            background: 'rgba(196,112,75,0.05)',
            border: '1px solid rgba(196,112,75,0.2)',
            marginBottom: 24,
            display: 'flex',
            gap: 14,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flexShrink: 0, marginTop: 2 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
              Email service not configured yet
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
              Add these environment variables to enable guest emails via Resend:
            </p>
            <pre
              style={{
                margin: '10px 0 0',
                padding: 12,
                borderRadius: 10,
                background: 'var(--bg-pure-white)',
                border: '1px solid var(--border-light)',
                fontSize: 12,
                color: 'var(--text-primary)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                overflow: 'auto',
              }}
            >
{`RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=no-reply@yourdomain.com
RESEND_FROM_NAME=Shriya & Neil
RESEND_REPLY_TO=shriyaneilwedding@gmail.com`}
            </pre>
            <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
              Note: Resend requires a verified sender domain, so emails cannot be sent directly from
              a Gmail address. A common approach is to verify a domain you own (e.g. shriyaneilwedding.com)
              and set the reply-to field so guests&apos; replies land in your Gmail inbox.
              The free tier includes 3,000 emails per month (100/day).
            </p>
          </div>
        </div>
      )}

      {/* Configured — show from address */}
      {status?.configured && (
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: 'rgba(122,139,92,0.05)',
            border: '1px solid rgba(122,139,92,0.15)',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-olive)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
            Sending from{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {status.from_name ? `${status.from_name} <${status.from_email}>` : status.from_email}
            </strong>
            {status.reply_to && (
              <>
                {' '}— replies go to{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{status.reply_to}</strong>
              </>
            )}
          </div>
        </div>
      )}

      {/* Template quick-picks */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', margin: '0 0 10px', fontFamily: 'var(--font-body)' }}>
          Start from a template
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTemplate(t.id)}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid var(--border-light)',
                background: 'var(--bg-pure-white)',
                fontSize: 13,
                fontFamily: 'var(--font-body)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-gold-dark)';
                e.currentTarget.style.color = 'var(--color-gold-dark)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-light)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div
        style={{
          padding: 24,
          borderRadius: 16,
          background: 'var(--bg-pure-white)',
          border: '1px solid var(--border-light)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* Audience */}
        <div>
          <label style={labelStyle}>Audience</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {([
              { id: 'all', label: 'Everyone', count: status?.counts.with_email ?? 0 },
              { id: 'attending', label: 'Attending', count: status?.counts.attending ?? 0 },
              { id: 'pending', label: 'Pending', count: status?.counts.pending ?? 0 },
              { id: 'declined', label: 'Declined', count: status?.counts.declined ?? 0 },
            ] as const).map((opt) => {
              const active = audience === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setAudience(opt.id)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 12,
                    border: '1px solid ' + (active ? 'var(--color-gold-dark)' : 'var(--border-light)'),
                    background: active ? 'rgba(198,163,85,0.08)' : 'var(--bg-pure-white)',
                    color: active ? 'var(--color-gold-dark)' : 'var(--text-secondary)',
                    fontSize: 13,
                    fontWeight: active ? 500 : 400,
                    fontFamily: 'var(--font-body)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {opt.label}
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 7px',
                      borderRadius: 999,
                      background: active ? 'rgba(198,163,85,0.15)' : 'var(--bg-soft-cream)',
                      color: active ? 'var(--color-gold-dark)' : 'var(--text-tertiary)',
                      fontWeight: 600,
                    }}
                  >
                    {opt.count}
                  </span>
                </button>
              );
            })}
          </div>
          {status && status.counts.total > status.counts.with_email && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
              {status.counts.total - status.counts.with_email} guest{status.counts.total - status.counts.with_email === 1 ? ' has' : 's have'} no email on file and will be skipped.
            </p>
          )}
        </div>

        {/* Subject */}
        <div>
          <label style={labelStyle}>Subject line</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder="Don't forget to RSVP"
            style={inputStyle}
          />
        </div>

        {/* Heading */}
        <div>
          <label style={labelStyle}>Headline (shown big in the email)</label>
          <input
            type="text"
            value={heading}
            onChange={(e) => setHeading(e.target.value)}
            maxLength={200}
            placeholder="A gentle RSVP reminder"
            style={inputStyle}
          />
        </div>

        {/* Body */}
        <div>
          <label style={labelStyle}>Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            maxLength={10000}
            placeholder="Write your message here. Leave a blank line between paragraphs."
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}
          />
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            Each guest will see &quot;Hi [their first name],&quot; automatically at the top.
          </p>
        </div>

        {/* CTA */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Button label (optional)</label>
            <input
              type="text"
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              maxLength={60}
              placeholder="RSVP now"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Button link (optional)</label>
            <input
              type="url"
              value={ctaUrl}
              onChange={(e) => setCtaUrl(e.target.value)}
              placeholder="https://..."
              style={inputStyle}
            />
          </div>
        </div>

        {/* Reply-to override */}
        <div>
          <label style={labelStyle}>
            Reply-to override (optional)
          </label>
          <input
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder={status?.reply_to || 'shriyaneilwedding@gmail.com'}
            style={inputStyle}
          />
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            When guests hit reply, their response will go to this address. Leave blank to use the configured default.
          </p>
        </div>

        {/* Send */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingTop: 8, borderTop: '1px solid var(--border-light)' }}>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!canSend}
            style={{
              padding: '12px 28px',
              borderRadius: 12,
              border: 'none',
              background: canSend
                ? 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))'
                : 'var(--border-light)',
              color: canSend ? '#FDFBF7' : 'var(--text-tertiary)',
              fontSize: 14,
              fontWeight: 500,
              fontFamily: 'var(--font-body)',
              cursor: canSend ? 'pointer' : 'not-allowed',
              boxShadow: canSend ? '0 2px 8px rgba(198,163,85,0.25)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {sending ? 'Sending…' : `Send to ${audienceCount} guest${audienceCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      {/* Result banner */}
      {result && (
        <div
          style={{
            marginTop: 20,
            padding: 20,
            borderRadius: 14,
            background: result.failed > 0 ? 'rgba(196,112,75,0.05)' : 'rgba(122,139,92,0.06)',
            border: '1px solid ' + (result.failed > 0 ? 'rgba(196,112,75,0.2)' : 'rgba(122,139,92,0.15)'),
          }}
        >
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
            {result.sent > 0
              ? `Sent ${result.sent} email${result.sent === 1 ? '' : 's'}`
              : result.message || 'No emails sent'}
            {result.failed > 0 && ` — ${result.failed} failed`}
          </p>
          {result.errors && result.errors.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
              {result.errors.map((e, i) => (
                <li key={i}>
                  {e.email}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sendError && (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 12,
            background: 'rgba(196,112,75,0.05)',
            border: '1px solid rgba(196,112,75,0.2)',
            color: 'var(--color-terracotta)',
            fontSize: 13,
            fontFamily: 'var(--font-body)',
          }}
        >
          {sendError}
        </div>
      )}

      {/* Confirm modal */}
      {confirmOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(27, 28, 26, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 20,
          }}
          onClick={() => !sending && setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-pure-white)',
              borderRadius: 16,
              padding: 28,
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
            }}
          >
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, margin: '0 0 10px', color: 'var(--text-primary)' }}>
              Send to {audienceCount} guest{audienceCount === 1 ? '' : 's'}?
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 20px', fontFamily: 'var(--font-body)', lineHeight: 1.55 }}>
              This will send &ldquo;{subject}&rdquo; to everyone in the{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{audience}</strong> audience with an email on file.
              This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={sending}
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-pure-white)',
                  color: 'var(--text-secondary)',
                  fontSize: 14,
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                style={{
                  padding: '10px 24px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
                  color: '#FDFBF7',
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: 'var(--font-body)',
                  cursor: sending ? 'default' : 'pointer',
                  opacity: sending ? 0.7 : 1,
                }}
              >
                {sending ? 'Sending…' : 'Send emails'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text-tertiary)',
  marginBottom: 6,
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--border-light)',
  background: 'var(--bg-pure-white)',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  color: 'var(--text-primary)',
  outline: 'none',
};
