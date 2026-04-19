'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { formatWeekdayShort, formatShortDate } from '@/lib/utils/date-format';
import { vendorColor } from '@/lib/utils/vendor-color';

interface Vendor {
  id: string;
  name: string;
  category: string | null;
}

interface MeetingSummary {
  id: string;
  title: string;
  meeting_date: string | null;
  created_by_role: string;
  created_by_label: string | null;
  created_at: string;
  todo_count: number;
}

interface MeetingDetail {
  meeting: {
    id: string;
    title: string;
    meeting_date: string | null;
    raw_notes: string;
    created_by_role: string;
    created_by_label: string | null;
    created_at: string;
  };
  stakeholders: Array<{ id: string; name: string; category: string | null }>;
  todos: Array<{
    id: string;
    title: string;
    description: string | null;
    due_date: string | null;
    priority: 'high' | 'normal' | 'low';
    status: 'open' | 'completed';
    assigned_to_vendor_id: string | null;
    vendor_name: string | null;
    created_at: string;
  }>;
}

const COUPLE_OPTION_ID = '__couple__';

export default function MeetingsPage({
  params,
}: {
  params: Promise<{ weddingId: string }>;
}) {
  const { weddingId } = use(params);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    meeting_date: new Date().toISOString().slice(0, 10),
    raw_notes: '',
    stakeholder_ids: [] as string[],
  });
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null);
  const [openMeeting, setOpenMeeting] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState<{ count: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, vRes] = await Promise.all([
        fetch(`/api/v1/dashboard/weddings/${weddingId}/meetings`),
        fetch(`/api/v1/dashboard/weddings/${weddingId}/vendors`),
      ]);
      const mData = await mRes.json();
      const vData = await vRes.json();
      setMeetings(mData.data?.meetings || []);
      setVendors(vData.data?.vendors || []);
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [weddingId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!openMeetingId) {
      setOpenMeeting(null);
      return;
    }
    fetch(`/api/v1/dashboard/weddings/${weddingId}/meetings/${openMeetingId}`)
      .then((r) => r.json())
      .then((d) => setOpenMeeting(d.data))
      .catch(() => setOpenMeeting(null));
  }, [openMeetingId, weddingId]);

  const submitMeeting = async () => {
    if (!draft.title.trim() || draft.raw_notes.trim().length < 10) return;
    setRecording(true);
    setError('');
    setLastResult(null);
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title.trim(),
          meeting_date: draft.meeting_date || null,
          raw_notes: draft.raw_notes,
          stakeholder_vendor_ids: draft.stakeholder_ids.filter(
            (id) => id !== COUPLE_OPTION_ID
          ),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Could not generate to-dos');
      setLastResult({ count: data.data?.todos_generated || 0 });
      setShowCreate(false);
      setDraft({
        title: '',
        meeting_date: new Date().toISOString().slice(0, 10),
        raw_notes: '',
        stakeholder_ids: [],
      });
      await load();
      setOpenMeetingId(data.data?.meeting?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setRecording(false);
    }
  };

  const deleteMeeting = async (id: string) => {
    if (!confirm('Delete this meeting and its to-dos?')) return;
    await fetch(`/api/v1/dashboard/weddings/${weddingId}/meetings/${id}`, {
      method: 'DELETE',
    });
    setOpenMeetingId(null);
    await load();
  };

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 220, height: 32, marginBottom: 16, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 16 }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={headingStyle}>Meetings &amp; AI to-dos</h1>
          <p style={subtitleStyle}>
            Paste notes from a planning meeting — we&apos;ll extract action items and assign them to the right stakeholders. They show up on each vendor&apos;s portal automatically.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} style={primary(false)}>
          + Record meeting
        </button>
      </div>

      {lastResult && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 12,
            background: 'rgba(122,139,92,0.08)',
            border: '1px solid rgba(122,139,92,0.2)',
            fontSize: 13,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
          }}
        >
          Generated <strong>{lastResult.count}</strong> to-do{lastResult.count === 1 ? '' : 's'} from your notes.
        </div>
      )}

      {meetings.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>
          No meetings yet. Record your first to extract action items.
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          {meetings.map((m, idx) => (
            <button
              key={m.id}
              onClick={() => setOpenMeetingId(m.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: 16,
                borderBottom: idx < meetings.length - 1 ? '1px solid var(--border-light)' : 'none',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 14,
                fontFamily: 'var(--font-body)',
              }}
            >
              <div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{m.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {m.meeting_date ? formatDate(m.meeting_date) : 'No date'} · by {m.created_by_role}
                  {m.created_by_label ? ` (${m.created_by_label})` : ''}
                </div>
              </div>
              <div style={{
                fontSize: 12,
                color: 'var(--color-gold-dark)',
                background: 'rgba(198,163,85,0.10)',
                padding: '4px 10px',
                borderRadius: 999,
                alignSelf: 'center',
                whiteSpace: 'nowrap',
              }}>
                {m.todo_count} to-do{m.todo_count === 1 ? '' : 's'}
              </div>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--color-terracotta)', fontFamily: 'var(--font-body)' }}>
          {error}
        </p>
      )}

      {/* Create meeting modal */}
      {showCreate && (
        <div
          style={overlay}
          onClick={() => !recording && setShowCreate(false)}
        >
          <div style={{ ...modal, maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalHeading}>Record a meeting</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={label}>Meeting title *</label>
                <input
                  type="text"
                  placeholder="Sangeet sound walk-through"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  style={input}
                />
              </div>
              <div>
                <label style={label}>Date</label>
                <input
                  type="date"
                  value={draft.meeting_date}
                  onChange={(e) => setDraft({ ...draft, meeting_date: e.target.value })}
                  style={input}
                />
              </div>
            </div>

            <label style={label}>Stakeholders in the room</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {[{ id: COUPLE_OPTION_ID, name: 'Bride & Groom', category: null }, ...vendors].map((v) => {
                const selected = draft.stakeholder_ids.includes(v.id);
                const isCouple = v.id === COUPLE_OPTION_ID;
                const color = isCouple ? '#A8883F' : vendorColor(v.id);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      const next = selected
                        ? draft.stakeholder_ids.filter((id) => id !== v.id)
                        : [...draft.stakeholder_ids, v.id];
                      setDraft({ ...draft, stakeholder_ids: next });
                    }}
                    style={{
                      padding: '5px 11px 5px 8px',
                      borderRadius: 999,
                      border: selected ? 'none' : '1px solid var(--border-light)',
                      background: selected ? color : 'var(--bg-pure-white)',
                      color: selected ? '#FDFBF7' : 'var(--text-primary)',
                      fontSize: 12,
                      fontFamily: 'var(--font-body)',
                      fontWeight: selected ? 600 : 500,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'background 0.15s',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        background: selected ? '#FDFBF7' : color,
                        display: 'inline-block',
                      }}
                    />
                    {v.name}
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>
              The couple is always implicit — to-dos can be assigned to them even if you don&apos;t pick the chip.
            </p>

            <label style={label}>Raw meeting notes *</label>
            <textarea
              rows={10}
              placeholder="Paste your meeting transcript or notes here…"
              value={draft.raw_notes}
              onChange={(e) => setDraft({ ...draft, raw_notes: e.target.value })}
              style={{ ...input, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.5 }}
            />
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '4px 0 16px', fontFamily: 'var(--font-body)' }}>
              {draft.raw_notes.length} characters · we&apos;ll extract concrete action items.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setShowCreate(false)} disabled={recording} style={secondary}>
                Cancel
              </button>
              <button
                onClick={submitMeeting}
                disabled={recording || !draft.title.trim() || draft.raw_notes.trim().length < 10}
                style={primary(recording || !draft.title.trim() || draft.raw_notes.trim().length < 10)}
              >
                {recording ? 'Generating…' : 'Generate to-dos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meeting detail modal */}
      {openMeetingId && openMeeting && (
        <div style={overlay} onClick={() => setOpenMeetingId(null)}>
          <div style={{ ...modal, maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ ...modalHeading, marginBottom: 0 }}>{openMeeting.meeting.title}</h2>
              <button
                onClick={() => deleteMeeting(openMeeting.meeting.id)}
                style={{ ...secondary, color: 'var(--color-terracotta)', padding: '6px 12px', fontSize: 12 }}
              >
                Delete
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 16px', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {openMeeting.meeting.meeting_date && (
                <span>{formatDate(openMeeting.meeting.meeting_date)}</span>
              )}
              {openMeeting.stakeholders.length > 0 && (
                <>
                  <span>·</span>
                  <span>with</span>
                  {openMeeting.stakeholders.map((s) => {
                    const color = vendorColor(s.id);
                    return (
                      <span
                        key={s.id}
                        style={{
                          fontSize: 11,
                          padding: '2px 8px 2px 6px',
                          borderRadius: 999,
                          background: color + '18',
                          color: color,
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: color,
                            display: 'inline-block',
                          }}
                        />
                        {s.name}
                      </span>
                    );
                  })}
                </>
              )}
            </div>

            <h3 style={{ ...sectionTitle, marginTop: 0 }}>To-dos generated</h3>
            {openMeeting.todos.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                No action items extracted from these notes.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {openMeeting.todos.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: '1px solid var(--border-light)',
                      background: t.status === 'completed' ? 'rgba(122,139,92,0.05)' : 'var(--bg-pure-white)',
                      opacity: t.status === 'completed' ? 0.7 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontWeight: 500, textDecoration: t.status === 'completed' ? 'line-through' : 'none' }}>
                        {t.title}
                      </span>
                      {t.priority === 'high' && (
                        <span style={{ fontSize: 10, color: 'var(--color-terracotta)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)' }}>
                          High
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {(() => {
                        const ownerId = t.assigned_to_vendor_id || 'couple';
                        const ownerName = t.vendor_name || 'Bride & Groom';
                        const color = t.assigned_to_vendor_id
                          ? vendorColor(t.assigned_to_vendor_id)
                          : '#A8883F';
                        return (
                          <span
                            key={ownerId}
                            style={{
                              fontSize: 11,
                              padding: '2px 8px 2px 6px',
                              borderRadius: 999,
                              background: color + '18',
                              color,
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span
                              aria-hidden
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: 999,
                                background: color,
                                display: 'inline-block',
                              }}
                            />
                            {ownerName}
                          </span>
                        );
                      })()}
                      {t.due_date && <span>· due {formatShortDate(t.due_date)}</span>}
                    </div>
                    {t.description && (
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                        {t.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <h3 style={sectionTitle}>Raw notes</h3>
            <pre style={{
              fontSize: 11,
              fontFamily: 'ui-monospace, monospace',
              padding: 12,
              borderRadius: 10,
              background: 'var(--bg-soft-cream)',
              color: 'var(--text-secondary)',
              maxHeight: 240,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              margin: 0,
            }}>
              {openMeeting.meeting.raw_notes}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setOpenMeetingId(null)} style={secondary}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return formatWeekdayShort(iso, { includeYear: true, fallback: iso });
}

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 28,
  fontWeight: 500,
  color: 'var(--text-primary)',
  margin: 0,
};
const subtitleStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-secondary)',
  margin: '4px 0 0',
  fontFamily: 'var(--font-body)',
  lineHeight: 1.55,
  maxWidth: 560,
};
const cardStyle: React.CSSProperties = {
  padding: 20,
  borderRadius: 16,
  background: 'var(--bg-pure-white)',
  border: '1px solid var(--border-light)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
  marginBottom: 20,
};
const label: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text-tertiary)',
  marginBottom: 6,
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
};
const input: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 10,
  border: '1px solid var(--border-light)',
  background: 'var(--bg-pure-white)',
  fontSize: 13,
  fontFamily: 'var(--font-body)',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
};
const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text-tertiary)',
  margin: '20px 0 10px',
  fontFamily: 'var(--font-body)',
};
const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(12, 10, 9, 0.4)',
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};
const modal: React.CSSProperties = {
  background: 'var(--bg-pure-white)',
  borderRadius: 16,
  padding: 24,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
};
const modalHeading: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 22,
  margin: '0 0 16px',
  color: 'var(--text-primary)',
};
function primary(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 18px',
    borderRadius: 10,
    border: 'none',
    background: disabled
      ? 'var(--border-light)'
      : 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
    color: disabled ? 'var(--text-tertiary)' : '#FDFBF7',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'var(--font-body)',
    cursor: disabled ? 'default' : 'pointer',
    whiteSpace: 'nowrap',
  };
}
const secondary: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 10,
  border: '1px solid var(--border-light)',
  background: 'var(--bg-pure-white)',
  color: 'var(--text-secondary)',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'var(--font-body)',
  cursor: 'pointer',
};
