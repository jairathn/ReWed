'use client';

import { useState, useEffect, use } from 'react';
import { countSegments } from '@/lib/messaging/segments';
import { normalizePhone } from '@/lib/messaging/normalize-phone';
import {
  zonedWallClockToUtc,
  utcToZonedWallClock,
  formatInTimeZone,
} from '@/lib/messaging/timezone';
import { validateSendAt } from '@/lib/messaging/schedule-window';

type Audience = 'all' | 'attending' | 'pending' | 'declined' | 'group' | 'custom';
type Mode = 'send' | 'schedule';

interface ScheduledText {
  id: string;
  body: string;
  audience: string;
  group_labels: string[] | null;
  recipient_count: number;
  send_at: string;
  skipped_bad_phone: number;
  created_at: string;
}

interface GuestPickerItem {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  rsvp_status: 'pending' | 'attending' | 'declined';
  group_label: string | null;
}

interface SmsStatus {
  configured: boolean;
  credentials_valid: boolean | null;
  credentials_error: string | null;
  from_number: string | null;
  uses_messaging_service: boolean;
  can_schedule: boolean;
  timezone: string;
  counts: {
    total: number;
    with_phone: number;
    attending: number;
    pending: number;
    declined: number;
  };
  groups: Array<{ label: string; with_phone: number }>;
  recent: Array<{
    id: string;
    body: string;
    audience: string;
    group_labels: string[] | null;
    recipient_count: number;
    sent_count: number;
    failed_count: number;
    skipped_bad_phone: number;
    created_at: string;
  }>;
  scheduled: ScheduledText[];
}

interface SendResult {
  sent: number;
  failed: number;
  skipped?: number;
  total?: number;
  message?: string;
  errors?: Array<{ name: string; phone: string; error: string }>;
}

// Rough Twilio US toll-free all-in rate (base + carrier fee) so the couple
// sees an order of magnitude, not an invoice.
const EST_COST_PER_SEGMENT = 0.016;

export default function MessagesPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [audience, setAudience] = useState<Audience>('all');
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [body, setBody] = useState('');

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [sendError, setSendError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Send-now vs schedule-for-later
  const [mode, setMode] = useState<Mode>('send');
  const [scheduleLocal, setScheduleLocal] = useState(''); // datetime-local wall clock
  const [scheduleMsg, setScheduleMsg] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // Custom audience state
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);
  const [guestList, setGuestList] = useState<GuestPickerItem[]>([]);
  const [guestListLoading, setGuestListLoading] = useState(false);
  const [guestSearch, setGuestSearch] = useState('');

  const loadStatus = () => {
    fetch(`/api/v1/dashboard/weddings/${weddingId}/sms/status`)
      .then((res) => res.json())
      .then((data) => setStatus(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(loadStatus, [weddingId]);

  const openGuestPicker = async () => {
    setGuestPickerOpen(true);
    if (guestList.length > 0) return;
    setGuestListLoading(true);
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/guests`);
      const data = await res.json();
      const withPhone: GuestPickerItem[] = (data.guests || []).filter(
        (g: GuestPickerItem) => normalizePhone(g.phone).ok
      );
      setGuestList(withPhone);
    } catch {
      // silent; user can retry by reopening
    } finally {
      setGuestListLoading(false);
    }
  };

  const toggleGuestSelected = (id: string) => {
    setSelectedGuestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (label: string) => {
    setAudience('group');
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const filteredGuestList = guestList.filter((g) => {
    if (!guestSearch.trim()) return true;
    const q = guestSearch.toLowerCase();
    const name = `${g.first_name} ${g.last_name}`.toLowerCase();
    return name.includes(q) || (g.phone || '').includes(q) || (g.group_label || '').toLowerCase().includes(q);
  });

  const allFilteredSelected =
    filteredGuestList.length > 0 &&
    filteredGuestList.every((g) => selectedGuestIds.has(g.id));

  const toggleSelectAllFiltered = () => {
    setSelectedGuestIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const g of filteredGuestList) next.delete(g.id);
      } else {
        for (const g of filteredGuestList) next.add(g.id);
      }
      return next;
    });
  };

  const audienceCount =
    audience === 'custom'
      ? selectedGuestIds.size
      : audience === 'group'
      ? (status?.groups || [])
          .filter((g) => selectedGroups.has(g.label))
          .reduce((sum, g) => sum + g.with_phone, 0)
      : status?.counts[
          audience === 'all'
            ? 'with_phone'
            : (audience as 'attending' | 'pending' | 'declined')
        ] ?? 0;

  const seg = countSegments(body);
  const estCost = audienceCount * seg.segments * EST_COST_PER_SEGMENT;

  const credsRejected = status?.configured === true && status.credentials_valid === false;

  const canSend =
    !!status?.configured &&
    !credsRejected &&
    !sending &&
    body.trim().length > 0 &&
    audienceCount > 0;

  const audienceDescription =
    audience === 'custom'
      ? `${selectedGuestIds.size} selected guest${selectedGuestIds.size === 1 ? '' : 's'}`
      : audience === 'group'
      ? [...selectedGroups].join(', ')
      : audience === 'all'
      ? 'everyone with a phone on file'
      : `the ${audience} list`;

  const handleSend = async () => {
    setSending(true);
    setSendError('');
    setResult(null);
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: body.trim(),
          audience: audience === 'custom' ? 'selected' : audience,
          group_labels: audience === 'group' ? Array.from(selectedGroups) : undefined,
          guest_ids: audience === 'custom' ? Array.from(selectedGuestIds) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data?.error?.message || data?.message || 'Failed to send');
      } else {
        setResult(data);
        loadStatus(); // refresh history
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  const tz = status?.timezone || 'America/New_York';

  // Default the picker to the next quarter-hour at least ~16 min out, so it
  // clears Twilio's 15-minute floor with margin. Rounding the UTC instant to a
  // 15-min boundary lands on a clean :00/:15/:30/:45 in any standard zone.
  const enterScheduleMode = () => {
    setMode('schedule');
    if (!scheduleLocal) {
      const q = 15 * 60 * 1000;
      const target = new Date(Math.ceil((Date.now() + 16 * 60 * 1000) / q) * q);
      setScheduleLocal(utcToZonedWallClock(target, tz));
    }
  };

  const scheduledUtc = scheduleLocal ? zonedWallClockToUtc(scheduleLocal, tz) : null;
  const scheduleCheck = scheduledUtc ? validateSendAt(scheduledUtc.toISOString()) : null;
  const scheduleValid = mode === 'schedule' ? !!scheduleCheck?.ok : true;

  const canSchedule =
    !!status?.can_schedule &&
    !sending &&
    body.trim().length > 0 &&
    audienceCount > 0 &&
    scheduleValid;

  const handleSchedule = async () => {
    if (!scheduledUtc) return;
    setSending(true);
    setSendError('');
    setScheduleMsg(null);
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/sms/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: body.trim(),
          audience: audience === 'custom' ? 'selected' : audience,
          group_labels: audience === 'group' ? Array.from(selectedGroups) : undefined,
          guest_ids: audience === 'custom' ? Array.from(selectedGuestIds) : undefined,
          send_at: scheduledUtc.toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data?.error?.message || data?.message || 'Failed to schedule');
      } else if (!data.scheduled) {
        setSendError(data.message || 'Nothing was scheduled.');
      } else {
        setScheduleMsg(
          `Scheduled for ${data.scheduled} guest${data.scheduled === 1 ? '' : 's'} on ${formatInTimeZone(
            new Date(data.send_at),
            tz
          )}.${data.skipped ? ` ${data.skipped} skipped (bad phone).` : ''}`
        );
        setBody('');
        setMode('send');
        loadStatus();
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to schedule');
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  const handleCancelScheduled = async (id: string) => {
    setCancelingId(id);
    try {
      const res = await fetch(
        `/api/v1/dashboard/weddings/${weddingId}/sms/scheduled/${id}`,
        { method: 'DELETE' }
      );
      if (res.ok) loadStatus();
    } catch {
      // leave it in the list; user can retry
    } finally {
      setCancelingId(null);
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
          Text Guests
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>
          Send SMS updates straight to guests&apos; phones — no app, no email, no opt-in step.
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
              SMS service not configured yet
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
              Add these environment variables to enable guest texting via Twilio:
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
{`TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+18445551234`}
            </pre>
            <p style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.6, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
              Setup: create a Twilio account, buy a toll-free number (~$2/mo), and submit
              toll-free verification in the Twilio console. Verification is free but US carriers
              take a few days to ~2 weeks to approve, so start early. Texts cost roughly 1.6¢
              per segment — a blast to 150 guests is about $2.50.
            </p>
          </div>
        </div>
      )}

      {/* Configured but Twilio rejected the credentials */}
      {credsRejected && (
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: 'rgba(196,112,75,0.06)',
            border: '1px solid rgba(196,112,75,0.25)',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Twilio rejected your credentials.</strong>{' '}
            {status?.credentials_error || 'Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'} Sending is
            disabled until this is fixed in your environment (Vercel → Settings → Environment Variables),
            then redeploy.
          </div>
        </div>
      )}

      {/* Configured and credentials accepted — show from number */}
      {status?.configured && !credsRejected && (
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
            Texting from{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {status.uses_messaging_service ? 'your Twilio Messaging Service' : status.from_number}
            </strong>
            {' '}— one-way broadcast; replies land in your Twilio console, not here.
          </div>
        </div>
      )}

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
              { id: 'all', label: 'Everyone with phone', count: status?.counts.with_phone ?? 0, color: 'var(--text-primary)', accent: 'var(--text-secondary)', tint: 'rgba(44,40,37,0.06)' },
              { id: 'attending', label: 'Attending', count: status?.counts.attending ?? 0, color: 'var(--color-olive)', accent: 'var(--color-olive)', tint: 'rgba(122,139,92,0.10)' },
              { id: 'pending', label: 'Pending', count: status?.counts.pending ?? 0, color: 'var(--color-gold-dark)', accent: 'var(--color-gold-dark)', tint: 'rgba(198,163,85,0.10)' },
              { id: 'declined', label: 'Declined', count: status?.counts.declined ?? 0, color: 'var(--color-terracotta)', accent: 'var(--color-terracotta)', tint: 'rgba(196,112,75,0.10)' },
              { id: 'custom', label: 'Custom', count: selectedGuestIds.size, color: 'var(--color-mediterranean-blue)', accent: 'var(--color-mediterranean-blue)', tint: 'rgba(43,95,138,0.10)' },
            ] as const).map((opt) => {
              const active = audience === opt.id;
              const isCustom = opt.id === 'custom';
              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    setAudience(opt.id);
                    if (isCustom) openGuestPicker();
                  }}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 12,
                    border: `1px solid ${active ? opt.accent : 'var(--border-light)'}`,
                    background: active ? opt.tint : 'var(--bg-pure-white)',
                    color: active ? opt.color : 'var(--text-secondary)',
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    fontFamily: 'var(--font-body)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                  }}
                >
                  {opt.label}
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: active ? opt.color : 'var(--bg-soft-cream)',
                      color: active ? '#FDFBF7' : 'var(--text-tertiary)',
                      fontWeight: 600,
                    }}
                  >
                    {isCustom && opt.count === 0 ? 'pick' : opt.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Group chips (from guest list group labels) */}
          {(status?.groups.length ?? 0) > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>
                Or pick one or more groups:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {status!.groups.map((g) => {
                  const active = audience === 'group' && selectedGroups.has(g.label);
                  return (
                    <button
                      key={g.label}
                      onClick={() => toggleGroup(g.label)}
                      style={{
                        padding: '7px 13px',
                        borderRadius: 999,
                        border: `1px solid ${active ? 'var(--color-mediterranean-blue)' : 'var(--border-light)'}`,
                        background: active ? 'rgba(43,95,138,0.10)' : 'var(--bg-pure-white)',
                        color: active ? 'var(--color-mediterranean-blue)' : 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: active ? 600 : 400,
                        fontFamily: 'var(--font-body)',
                        cursor: 'pointer',
                        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                      }}
                    >
                      {g.label} · {g.with_phone}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {audience === 'custom' && selectedGuestIds.size > 0 && (
            <button
              onClick={openGuestPicker}
              style={{
                marginTop: 10,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-light)',
                background: 'var(--bg-pure-white)',
                color: 'var(--color-gold-dark)',
                fontSize: 12,
                fontFamily: 'var(--font-body)',
                cursor: 'pointer',
              }}
            >
              Edit selection ({selectedGuestIds.size} guest{selectedGuestIds.size === 1 ? '' : 's'})
            </button>
          )}

          {audience !== 'custom' && status && status.counts.total > status.counts.with_phone && (
            <div
              style={{
                margin: '10px 0 0',
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(218,175,53,0.10)',
                border: '1px solid rgba(218,175,53,0.30)',
                fontSize: 12,
                color: 'var(--color-gold-dark)',
                fontFamily: 'var(--font-body)',
              }}
            >
              ⚠ {status.counts.total - status.counts.with_phone} of {status.counts.total} guest
              {status.counts.total - status.counts.with_phone === 1 ? ' has' : 's have'} no usable
              phone on file (no number, or one we couldn&apos;t read) and will be skipped. Numbers
              without a country code are assumed US (+1); fix any others on the Guests page.
            </div>
          )}
        </div>

        {/* Body */}
        <div>
          <label style={labelStyle}>Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={1600}
            placeholder="Shuttle leaves the hotel at 3:30pm sharp — see you in the lobby!"
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              margin: '6px 0 0',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-body)',
            }}
          >
            <span>
              {seg.length} character{seg.length === 1 ? '' : 's'} ·{' '}
              {seg.segments} SMS segment{seg.segments === 1 ? '' : 's'}
              {seg.encoding === 'UCS-2' && seg.length > 0 && (
                <span style={{ color: 'var(--color-gold-dark)' }}>
                  {' '}
                  (emoji/special characters shorten segments to 70 chars)
                </span>
              )}
            </span>
            {audienceCount > 0 && seg.segments > 0 && (
              <span>
                est. Twilio cost ≈ ${estCost < 0.01 ? '0.01' : estCost.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Send / Schedule */}
        <div style={{ paddingTop: 8, borderTop: '1px solid var(--border-light)' }}>
          {/* Mode toggle — only when a Messaging Service is configured */}
          {status?.can_schedule && (
            <div style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: 'var(--bg-soft-cream)', marginBottom: 16 }}>
              {(['send', 'schedule'] as const).map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => (m === 'schedule' ? enterScheduleMode() : setMode('send'))}
                    style={{
                      padding: '7px 16px',
                      borderRadius: 8,
                      border: 'none',
                      background: active ? 'var(--bg-pure-white)' : 'transparent',
                      color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      fontFamily: 'var(--font-body)',
                      cursor: 'pointer',
                      boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    {m === 'send' ? 'Send now' : 'Schedule'}
                  </button>
                );
              })}
            </div>
          )}

          {/* Schedule picker */}
          {mode === 'schedule' && status?.can_schedule && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Send at ({tz.replace(/_/g, ' ')})</label>
              <input
                type="datetime-local"
                value={scheduleLocal}
                min={utcToZonedWallClock(new Date(Date.now() + 15 * 60 * 1000), tz)}
                onChange={(e) => setScheduleLocal(e.target.value)}
                style={{ ...inputStyle, maxWidth: 280 }}
              />
              {scheduledUtc && scheduleCheck && !scheduleCheck.ok && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-terracotta)', fontFamily: 'var(--font-body)' }}>
                  {scheduleCheck.error}
                </p>
              )}
              <div
                style={{
                  margin: '12px 0 0',
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(43,95,138,0.05)',
                  border: '1px solid rgba(43,95,138,0.15)',
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                The recipient list is locked when you schedule. If you add guests or fix
                numbers afterward, cancel this scheduled text and reschedule to include them.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {(() => {
              const ready = mode === 'send' ? canSend : canSchedule;
              return (
                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!ready}
                  style={{
                    padding: '12px 28px',
                    borderRadius: 12,
                    border: 'none',
                    background: ready
                      ? 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))'
                      : 'var(--border-light)',
                    color: ready ? '#FDFBF7' : 'var(--text-tertiary)',
                    fontSize: 14,
                    fontWeight: 500,
                    fontFamily: 'var(--font-body)',
                    cursor: ready ? 'pointer' : 'not-allowed',
                    boxShadow: ready ? '0 2px 8px rgba(198,163,85,0.25)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {sending
                    ? mode === 'send'
                      ? 'Sending…'
                      : 'Scheduling…'
                    : mode === 'send'
                    ? `Text ${audienceCount} guest${audienceCount === 1 ? '' : 's'}`
                    : `Schedule for ${audienceCount} guest${audienceCount === 1 ? '' : 's'}`}
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Schedule success banner */}
      {scheduleMsg && (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 14,
            background: 'rgba(122,139,92,0.06)',
            border: '1px solid rgba(122,139,92,0.15)',
            fontSize: 14,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
          }}
        >
          {scheduleMsg}
        </div>
      )}

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
              ? `Sent ${result.sent} text${result.sent === 1 ? '' : 's'}`
              : result.message || 'No texts sent'}
            {result.failed > 0 && ` — ${result.failed} failed`}
            {(result.skipped ?? 0) > 0 && ` — ${result.skipped} skipped (bad phone)`}
          </p>
          {result.errors && result.errors.length > 0 && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
              {result.errors.map((e, i) => (
                <li key={i}>
                  {e.name} ({e.phone}): {e.error}
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

      {/* Scheduled texts */}
      {(status?.scheduled.length ?? 0) > 0 && (
        <div style={{ marginTop: 32 }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', margin: '0 0 10px', fontFamily: 'var(--font-body)' }}>
            Scheduled texts
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {status!.scheduled.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: 'var(--bg-pure-white)',
                  border: '1px solid rgba(43,95,138,0.25)',
                  display: 'flex',
                  gap: 14,
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {m.body.length > 220 ? m.body.slice(0, 220) + '…' : m.body}
                  </p>
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-mediterranean-blue)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    ⏰ {formatInTimeZone(new Date(m.send_at), tz)}
                    <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
                      {' · '}
                      {m.audience === 'group' && m.group_labels?.length
                        ? m.group_labels.join(', ')
                        : m.audience}
                      {' · '}
                      {m.recipient_count} recipient{m.recipient_count === 1 ? '' : 's'}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => handleCancelScheduled(m.id)}
                  disabled={cancelingId === m.id}
                  style={{
                    flexShrink: 0,
                    padding: '7px 14px',
                    borderRadius: 9,
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-pure-white)',
                    color: 'var(--color-terracotta)',
                    fontSize: 12,
                    fontWeight: 500,
                    fontFamily: 'var(--font-body)',
                    cursor: cancelingId === m.id ? 'default' : 'pointer',
                    opacity: cancelingId === m.id ? 0.6 : 1,
                  }}
                >
                  {cancelingId === m.id ? 'Canceling…' : 'Cancel'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {(status?.recent.length ?? 0) > 0 && (
        <div style={{ marginTop: 32 }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', margin: '0 0 10px', fontFamily: 'var(--font-body)' }}>
            Recent texts
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {status!.recent.map((m) => (
              <div
                key={m.id}
                style={{
                  padding: '14px 16px',
                  borderRadius: 12,
                  background: 'var(--bg-pure-white)',
                  border: '1px solid var(--border-light)',
                }}
              >
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {m.body.length > 220 ? m.body.slice(0, 220) + '…' : m.body}
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                  {new Date(m.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  {' · '}
                  {m.audience === 'group' && m.group_labels?.length
                    ? m.group_labels.join(', ')
                    : m.audience}
                  {' · '}
                  sent to {m.sent_count}
                  {m.failed_count > 0 && ` · ${m.failed_count} failed`}
                  {m.skipped_bad_phone > 0 && ` · ${m.skipped_bad_phone} skipped`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guest picker modal */}
      {guestPickerOpen && (
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
          onClick={() => setGuestPickerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-pure-white)',
              borderRadius: 16,
              maxWidth: 560,
              width: '100%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '22px 24px 14px', borderBottom: '1px solid var(--border-light)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, margin: '0 0 6px', color: 'var(--text-primary)' }}>
                Pick guests to text
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                Only guests with a usable phone number are shown.
              </p>
              <input
                type="text"
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                placeholder="Search by name, phone, or group..."
                style={{
                  ...inputStyle,
                  marginTop: 14,
                }}
                autoFocus
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                  {selectedGuestIds.size} of {guestList.length} selected
                </span>
                {filteredGuestList.length > 0 && (
                  <button
                    onClick={toggleSelectAllFiltered}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--color-gold-dark)',
                      fontSize: 12,
                      fontFamily: 'var(--font-body)',
                      cursor: 'pointer',
                    }}
                  >
                    {allFilteredSelected ? 'Clear' : 'Select all'}
                    {guestSearch.trim() ? ' matching' : ''}
                  </button>
                )}
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 8px' }}>
              {guestListLoading ? (
                <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                  Loading guests...
                </div>
              ) : filteredGuestList.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                  {guestList.length === 0
                    ? 'No guests with a usable phone on file yet.'
                    : `No guests match "${guestSearch}"`}
                </div>
              ) : (
                filteredGuestList.map((g) => {
                  const selected = selectedGuestIds.has(g.id);
                  return (
                    <label
                      key={g.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 14px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        background: selected ? 'rgba(198,163,85,0.06)' : 'transparent',
                        transition: 'background 0.1s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleGuestSelected(g.id)}
                        style={{ width: 16, height: 16, accentColor: 'var(--color-gold-dark)', cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                          {g.first_name} {g.last_name}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {g.phone}
                          {g.group_label && ` · ${g.group_label}`}
                        </p>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                          padding: '3px 8px',
                          borderRadius: 999,
                          fontWeight: 600,
                          background:
                            g.rsvp_status === 'attending'
                              ? 'rgba(122,139,92,0.12)'
                              : g.rsvp_status === 'declined'
                              ? 'rgba(196,112,75,0.1)'
                              : 'var(--bg-soft-cream)',
                          color:
                            g.rsvp_status === 'attending'
                              ? 'var(--color-olive)'
                              : g.rsvp_status === 'declined'
                              ? 'var(--color-terracotta)'
                              : 'var(--text-tertiary)',
                        }}
                      >
                        {g.rsvp_status}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid var(--border-light)' }}>
              <button
                onClick={() => {
                  setSelectedGuestIds(new Set());
                }}
                disabled={selectedGuestIds.size === 0}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'transparent',
                  color: selectedGuestIds.size === 0 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                  fontSize: 13,
                  fontFamily: 'var(--font-body)',
                  cursor: selectedGuestIds.size === 0 ? 'default' : 'pointer',
                }}
              >
                Clear all
              </button>
              <button
                onClick={() => setGuestPickerOpen(false)}
                style={{
                  padding: '10px 24px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
                  color: '#FDFBF7',
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(198,163,85,0.25)',
                }}
              >
                Done
              </button>
            </div>
          </div>
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
              {mode === 'send' ? 'Text' : 'Schedule for'} {audienceCount} guest{audienceCount === 1 ? '' : 's'}?
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 8px', fontFamily: 'var(--font-body)', lineHeight: 1.55 }}>
              {mode === 'send' ? (
                <>
                  This will send the message below to{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{audienceDescription}</strong>.
                  Texts cannot be unsent.
                </>
              ) : (
                <>
                  This will queue the message below for{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{audienceDescription}</strong>,
                  sending{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {scheduledUtc ? formatInTimeZone(scheduledUtc, tz) : ''}
                  </strong>
                  . You can cancel it any time before then.
                </>
              )}
            </p>
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-primary)',
                margin: '0 0 20px',
                padding: '10px 14px',
                borderRadius: 10,
                background: 'var(--bg-soft-cream)',
                fontFamily: 'var(--font-body)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                maxHeight: 140,
                overflow: 'auto',
              }}
            >
              {body.trim()}
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
                onClick={mode === 'send' ? handleSend : handleSchedule}
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
                {sending
                  ? mode === 'send'
                    ? 'Sending…'
                    : 'Scheduling…'
                  : mode === 'send'
                  ? 'Send texts'
                  : 'Schedule texts'}
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
