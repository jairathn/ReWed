'use client';

import { useState, useEffect, use, useCallback } from 'react';
import {
  formatLongDate,
  formatWeekdayShort,
  formatShortDate,
  daysUntil,
  normalizeDate,
} from '@/lib/utils/date-format';
import { vendorColorByName } from '@/lib/utils/vendor-color';

interface Vendor {
  id: string;
  name: string;
  category: string | null;
  notes: string | null;
}

interface Wedding {
  slug: string;
  display_name: string;
  wedding_date: string | null;
  venue_city: string | null;
  venue_country: string | null;
}

interface TimelineEntry {
  id: string;
  event_date: string | null;
  event_name: string | null;
  time_label: string | null;
  action: string;
  location: string | null;
  notes: string | null;
  status: string | null;
  deadline: boolean;
}

interface MasterEntry extends TimelineEntry {
  vendor_names: string[];
}

interface CoordContact {
  entry_id: string;
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
  whatsapp: boolean;
  email: string | null;
}

interface EmergencyContact {
  role: string;
  name: string;
  phone: string | null;
  whatsapp: boolean;
}

interface VendorTodo {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: 'high' | 'normal' | 'low';
  status: 'open' | 'completed';
  meeting_title: string | null;
  meeting_date: string | null;
  age_days: number;
  urgency: 'fresh' | 'yellow' | 'orange' | 'red';
}

interface PortalData {
  vendor: Vendor;
  wedding: Wedding;
  assigned: TimelineEntry[];
  coordination_contacts: CoordContact[];
  master_timeline: MasterEntry[];
  emergency_contacts: EmergencyContact[];
  todos: VendorTodo[];
}

type Tab = 'mine' | 'todos' | 'master' | 'contacts' | 'ask';

export default function VendorPortalPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = use(params);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('mine');
  const [commentEntry, setCommentEntry] = useState<TimelineEntry | null>(null);
  const [commentBox, setCommentBox] = useState({ comment: '', proposed_change: '' });
  const [submitting, setSubmitting] = useState(false);
  const [commentSentAt, setCommentSentAt] = useState<Date | null>(null);
  // Day filter — applies to both "My timeline" and "Master timeline" tabs.
  const [dayFilter, setDayFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/v/${slug}/${token}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error?.message || 'Could not load vendor page');
      }
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => { load(); }, [load]);

  const submitComment = async () => {
    if (!commentBox.comment.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/v/${slug}/${token}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: commentBox.comment,
          proposed_change: commentBox.proposed_change || null,
          timeline_entry_id: commentEntry?.id || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error?.message || 'Failed to send');
      }
      setCommentSentAt(new Date());
      setCommentBox({ comment: '', proposed_change: '' });
      setTimeout(() => {
        setCommentEntry(null);
        setCommentSentAt(null);
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="skeleton" style={{ width: 320, height: 220, borderRadius: 18 }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg-warm-gradient)' }}>
        <div style={{ maxWidth: 420, textAlign: 'center', padding: 32, background: 'var(--bg-pure-white)', borderRadius: 18 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: '0 0 8px', color: 'var(--text-primary)' }}>
            Link not valid
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>
            {error || 'Ask the couple for a fresh link.'}
          </p>
        </div>
      </div>
    );
  }

  const matchesDay = (eventDate: string | null) => {
    if (!dayFilter) return true;
    const ds = normalizeDate(eventDate);
    return ds === dayFilter;
  };

  // Distinct days present across *either* my assignments or the master timeline
  // — so the day pills stay consistent whichever tab you're on.
  const allDays = Array.from(
    new Set(
      [...data.assigned, ...data.master_timeline]
        .map((e) => normalizeDate(e.event_date))
        .filter((d): d is string => !!d)
    )
  ).sort();

  // Group assigned by event_date, after filter
  const groups = new Map<string, { date: string; name: string; entries: TimelineEntry[] }>();
  for (const e of data.assigned) {
    if (!matchesDay(e.event_date)) continue;
    const key = `${e.event_date || 'unscheduled'}__${e.event_name || ''}`;
    if (!groups.has(key)) {
      groups.set(key, {
        date: e.event_date || '',
        name: e.event_name || 'Unscheduled',
        entries: [],
      });
    }
    groups.get(key)!.entries.push(e);
  }
  const groupList = Array.from(groups.values());

  // Build coordination contacts list (deduped by id)
  const contactMap = new Map<string, CoordContact>();
  for (const c of data.coordination_contacts) {
    if (!contactMap.has(c.id)) contactMap.set(c.id, c);
  }
  const uniqueContacts = Array.from(contactMap.values());

  const daysToGo = daysUntil(data.wedding.wedding_date);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-warm-gradient)' }}>
      {/* Header */}
      <header
        style={{
          padding: '28px 20px 20px',
          textAlign: 'center',
          borderBottom: '1px solid var(--border-light)',
          background: 'var(--bg-pure-white)',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: 18,
            color: 'var(--color-gold-dark)',
            margin: '0 0 4px',
            letterSpacing: '0.02em',
          }}
        >
          Zari · Vendor portal
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 500,
            color: 'var(--text-primary)',
            margin: '4px 0 2px',
          }}
        >
          {data.wedding.display_name}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>
          {formatLongDate(data.wedding.wedding_date)}
          {data.wedding.venue_city && ` · ${data.wedding.venue_city}${data.wedding.venue_country ? ', ' + data.wedding.venue_country : ''}`}
        </p>

        <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 999,
              background: 'var(--bg-soft-cream)',
              border: '1px solid var(--border-light)',
            }}
          >
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
              {data.vendor.name}
            </span>
            {data.vendor.category && (
              <span style={{ fontSize: 11, color: 'var(--color-gold-dark)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)' }}>
                {data.vendor.category}
              </span>
            )}
          </span>
          {daysToGo !== null && daysToGo > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 999,
                background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
                color: '#FDFBF7',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {daysToGo} {daysToGo === 1 ? 'day' : 'days'} to go
            </span>
          )}
          {daysToGo !== null && daysToGo === 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 12px',
                borderRadius: 999,
                background: 'var(--color-terracotta)',
                color: '#FDFBF7',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Today&apos;s the day
            </span>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav
        style={{
          display: 'flex',
          gap: 4,
          padding: '12px 20px',
          background: 'var(--bg-pure-white)',
          borderBottom: '1px solid var(--border-light)',
          overflowX: 'auto',
          justifyContent: 'center',
        }}
      >
        {([
          { id: 'mine' as const, label: `My timeline (${data.assigned.length})` },
          { id: 'todos' as const, label: `To-dos (${data.todos.filter((t) => t.status === 'open').length})` },
          { id: 'master' as const, label: 'Master timeline' },
          { id: 'contacts' as const, label: `Contacts (${uniqueContacts.length + data.emergency_contacts.length})` },
          { id: 'ask' as const, label: 'Ask the FAQbot' },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              border: 'none',
              background: tab === t.id ? 'rgba(198,163,85,0.10)' : 'transparent',
              color: tab === t.id ? 'var(--color-gold-dark)' : 'var(--text-secondary)',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
              fontWeight: tab === t.id ? 500 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
        {tab === 'mine' && (
          <>
            <SectionHeader
              title="Your assigned timeline"
              subtitle="Tap any entry to leave a note for the couple. They'll get an email immediately."
            />
            <DayFilter days={allDays} value={dayFilter} onChange={setDayFilter} />
            {groupList.length === 0 ? (
              <Empty
                text={
                  dayFilter
                    ? 'Nothing assigned to you on this day.'
                    : 'No entries assigned to you yet.'
                }
              />
            ) : (
              groupList.map((g) => (
                <div key={`${g.date}__${g.name}`} style={{ marginBottom: 20 }}>
                  <DayHeading date={g.date} name={g.name} />
                  <div style={cardStyle}>
                    {g.entries.map((e, idx) => (
                      <div
                        key={e.id}
                        onClick={() => { setCommentEntry(e); setCommentSentAt(null); }}
                        style={{
                          padding: '14px 16px',
                          borderBottom: idx < g.entries.length - 1 ? '1px solid var(--border-light)' : 'none',
                          cursor: 'pointer',
                          display: 'grid',
                          gridTemplateColumns: '90px 1fr',
                          gap: 12,
                        }}
                      >
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums' }}>
                          {e.time_label || '—'}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', lineHeight: 1.45 }}>
                            {e.action}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                            {e.location && <span style={chip}>{e.location}</span>}
                            {e.deadline && <span style={chipDeadline}>Deadline</span>}
                            {e.status && !e.deadline && /to\s*do/i.test(e.status) && (
                              <span style={chipTodo}>To do</span>
                            )}
                          </div>
                          {e.notes && (
                            <p style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                              {e.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}

            <div style={{ marginTop: 28 }}>
              <button
                onClick={() => { setCommentEntry(null); setCommentBox({ comment: '', proposed_change: '' }); setCommentSentAt(null); setCommentEntry({ id: '', event_date: null, event_name: null, time_label: null, action: 'General message', location: null, notes: null, status: null, deadline: false }); }}
                style={primaryBtn}
              >
                Send a general note to the couple
              </button>
            </div>
          </>
        )}

        {tab === 'todos' && (
          <TodosTab
            todos={data.todos}
            slug={slug}
            token={token}
            onChanged={load}
          />
        )}

        {tab === 'master' && (
          <>
            <SectionHeader
              title="Master timeline (read-only)"
              subtitle="Everything happening across all vendors and events."
            />
            <DayFilter days={allDays} value={dayFilter} onChange={setDayFilter} />
            {data.master_timeline.length === 0 ? (
              <Empty text="No master timeline yet." />
            ) : (
              <MasterTimeline
                entries={data.master_timeline.filter((e) => matchesDay(e.event_date))}
                myVendorName={data.vendor.name}
                emptyText={dayFilter ? 'Nothing scheduled for this day.' : 'No master timeline yet.'}
              />
            )}
          </>
        )}

        {tab === 'contacts' && (
          <>
            <SectionHeader
              title="Coordination contacts"
              subtitle="Other vendors you share timeline entries with."
            />
            {uniqueContacts.length === 0 ? (
              <Empty text="No coordination partners yet." />
            ) : (
              <div style={cardStyle}>
                {uniqueContacts.map((c, idx) => (
                  <ContactRow
                    key={c.id}
                    name={c.name}
                    category={c.category}
                    phone={c.phone}
                    whatsapp={c.whatsapp}
                    email={c.email}
                    last={idx === uniqueContacts.length - 1}
                  />
                ))}
              </div>
            )}

            <SectionHeader
              title="Emergency contacts"
              subtitle="Day-of go-to people."
              top={28}
            />
            {data.emergency_contacts.length === 0 ? (
              <Empty text="No emergency contacts on file." />
            ) : (
              <div style={cardStyle}>
                {data.emergency_contacts.map((c, idx) => (
                  <ContactRow
                    key={`${c.role}-${c.name}-${idx}`}
                    name={c.name}
                    category={c.role}
                    phone={c.phone}
                    whatsapp={c.whatsapp}
                    email={null}
                    last={idx === data.emergency_contacts.length - 1}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'ask' && <FaqWidget slug={slug} token={token} />}
      </main>

      {/* Comment modal */}
      {commentEntry && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(12,10,9,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}
          onClick={() => setCommentEntry(null)}
        >
          <div
            style={{ background: 'var(--bg-pure-white)', borderRadius: 18, padding: 22, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 4px', color: 'var(--text-primary)' }}>
              Send a note to the couple
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 16px', fontFamily: 'var(--font-body)' }}>
              {commentEntry.id
                ? `About: ${commentEntry.time_label ? commentEntry.time_label + ' — ' : ''}${commentEntry.action.slice(0, 80)}`
                : 'A general message — not tied to any specific timeline entry.'}
            </p>
            {commentSentAt ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-olive)', fontFamily: 'var(--font-body)', fontSize: 14 }}>
                Sent ✓ — they&apos;ll get an email shortly.
              </div>
            ) : (
              <>
                <label style={label}>Your message *</label>
                <textarea
                  rows={4}
                  value={commentBox.comment}
                  onChange={(e) => setCommentBox({ ...commentBox, comment: e.target.value })}
                  style={{ ...input, resize: 'vertical' }}
                  placeholder="Question, FYI, or anything you'd like the couple to know"
                />

                <label style={{ ...label, marginTop: 12 }}>Proposed change (optional)</label>
                <textarea
                  rows={3}
                  value={commentBox.proposed_change}
                  onChange={(e) => setCommentBox({ ...commentBox, proposed_change: e.target.value })}
                  style={{ ...input, resize: 'vertical' }}
                  placeholder="e.g. Move setup from 10am to 11am because of bus traffic"
                />

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button onClick={() => setCommentEntry(null)} style={secondaryBtn}>
                    Cancel
                  </button>
                  <button
                    onClick={submitComment}
                    disabled={submitting || !commentBox.comment.trim()}
                    style={primaryBtn}
                  >
                    {submitting ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TodosTab({
  todos,
  slug,
  token,
  onChanged,
}: {
  todos: VendorTodo[];
  slug: string;
  token: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const setStatus = async (id: string, status: 'open' | 'completed') => {
    setBusy(id);
    try {
      await fetch(`/api/v1/v/${slug}/${token}/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const open = todos.filter((t) => t.status === 'open');
  const done = todos.filter((t) => t.status === 'completed');

  return (
    <>
      <SectionHeader
        title="Your to-dos"
        subtitle="Action items from planning meetings. Tick them off as you go."
      />
      {open.length === 0 && done.length === 0 ? (
        <Empty text="No to-dos for you yet." />
      ) : (
        <>
          {open.length > 0 && (
            <div style={cardStyle}>
              {open.map((t, idx) => (
                <TodoRow
                  key={t.id}
                  todo={t}
                  busy={busy === t.id}
                  last={idx === open.length - 1}
                  onToggle={() => setStatus(t.id, 'completed')}
                />
              ))}
            </div>
          )}
          {done.length > 0 && (
            <>
              <h3 style={{ ...sectionSubtitle }}>Done</h3>
              <div style={cardStyle}>
                {done.map((t, idx) => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    busy={busy === t.id}
                    last={idx === done.length - 1}
                    onToggle={() => setStatus(t.id, 'open')}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function TodoRow({
  todo, busy, last, onToggle,
}: {
  todo: VendorTodo;
  busy: boolean;
  last: boolean;
  onToggle: () => void;
}) {
  const urgencyColor =
    todo.urgency === 'red' ? '#9B2222'
    : todo.urgency === 'orange' ? '#9B5217'
    : todo.urgency === 'yellow' ? '#7A5C0F'
    : null;

  return (
    <div
      style={{
        padding: '12px 14px',
        borderBottom: last ? 'none' : '1px solid var(--border-light)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <input
        type="checkbox"
        checked={todo.status === 'completed'}
        disabled={busy}
        onChange={onToggle}
        style={{ marginTop: 3, accentColor: 'var(--color-gold-dark)', cursor: busy ? 'default' : 'pointer' }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 14,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
            opacity: todo.status === 'completed' ? 0.7 : 1,
          }}>
            {todo.title}
          </span>
          {todo.priority === 'high' && todo.status === 'open' && (
            <span style={{ fontSize: 10, color: 'var(--color-terracotta)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
              High
            </span>
          )}
          {urgencyColor && todo.status === 'open' && (
            <span style={{ fontSize: 10, color: urgencyColor, textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
              {todo.age_days}d
            </span>
          )}
        </div>
        {(todo.description || todo.due_date || todo.meeting_title) && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: 'var(--font-body)' }}>
            {todo.due_date && `Due ${formatShortDate(todo.due_date)}`}
            {todo.due_date && todo.meeting_title && ' · '}
            {todo.meeting_title && `from "${todo.meeting_title}"`}
          </div>
        )}
        {todo.description && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
            {todo.description}
          </p>
        )}
      </div>
    </div>
  );
}

const sectionSubtitle: React.CSSProperties = {
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text-tertiary)',
  margin: '20px 0 10px',
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
};

function FaqWidget({ slug, token }: { slug: string; token: string }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const ask = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/v/${slug}/${token}/faq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Could not get an answer');
      setAnswer(data.data.answer);
      setRemaining(data.data.remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get an answer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SectionHeader
        title="Ask about your role"
        subtitle="Quick answers about your timeline, who to coordinate with, and emergency contacts. 20 questions per day."
      />
      <div style={cardStyle}>
        <textarea
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What time should I arrive on Sept 11?"
          style={{ ...input, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
            {remaining !== null ? `${remaining} questions left today` : ''}
          </span>
          <button onClick={ask} disabled={loading || !question.trim()} style={primaryBtn}>
            {loading ? 'Thinking…' : 'Ask'}
          </button>
        </div>
        {error && (
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--color-terracotta)', fontFamily: 'var(--font-body)' }}>
            {error}
          </p>
        )}
        {answer && !error && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'var(--bg-soft-cream)', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {answer}
          </div>
        )}
      </div>
    </>
  );
}

function MasterTimeline({
  entries,
  myVendorName,
  emptyText,
}: {
  entries: MasterEntry[];
  myVendorName: string;
  emptyText?: string;
}) {
  if (entries.length === 0) {
    return <Empty text={emptyText || 'Nothing scheduled.'} />;
  }
  const groups = new Map<string, MasterEntry[]>();
  for (const e of entries) {
    const key = `${e.event_date || 'unscheduled'}__${e.event_name || ''}`;
    const list = groups.get(key) || [];
    list.push(e);
    groups.set(key, list);
  }

  return (
    <>
      {Array.from(groups.entries()).map(([key, list]) => {
        const first = list[0];
        return (
          <div key={key} style={{ marginBottom: 20 }}>
            <DayHeading date={first.event_date || ''} name={first.event_name || 'Unscheduled'} />
            <div style={cardStyle}>
              {list.map((e, idx) => {
                const isMine = e.vendor_names.includes(myVendorName);
                return (
                  <div
                    key={e.id}
                    style={{
                      padding: '12px 14px',
                      borderBottom: idx < list.length - 1 ? '1px solid var(--border-light)' : 'none',
                      display: 'grid',
                      gridTemplateColumns: '78px 1fr',
                      gap: 10,
                      background: isMine ? 'rgba(198,163,85,0.04)' : 'transparent',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums' }}>
                      {e.time_label || '—'}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', lineHeight: 1.45 }}>
                        {e.action}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
                        {e.location && <span style={chip}>📍 {e.location}</span>}
                        {e.vendor_names.length === 0 && (
                          <span style={chipNoOwner}>⚠ No owner</span>
                        )}
                        {e.vendor_names.map((n) => {
                          const isMe = n === myVendorName;
                          const color = isMe ? '#A8883F' : vendorColorByName(n);
                          return (
                            <span
                              key={n}
                              style={{
                                fontSize: 11,
                                padding: '2px 9px 2px 7px',
                                borderRadius: 999,
                                background: isMe
                                  ? 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))'
                                  : color + '18',
                                color: isMe ? '#FDFBF7' : color,
                                fontFamily: 'var(--font-body)',
                                fontWeight: isMe ? 600 : 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {!isMe && (
                                <span
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: 999,
                                    background: color,
                                    display: 'inline-block',
                                  }}
                                />
                              )}
                              {isMe ? 'You' : n}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

function DayFilter({
  days,
  value,
  onChange,
}: {
  days: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  if (days.length <= 1) return null;
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        marginBottom: 16,
        padding: '8px 10px',
        borderRadius: 12,
        background: 'var(--bg-pure-white)',
        border: '1px solid var(--border-light)',
      }}
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        style={{
          padding: '6px 12px',
          borderRadius: 999,
          border: value === null ? 'none' : '1px solid var(--border-light)',
          background: value === null ? 'var(--color-gold-dark)' : 'transparent',
          color: value === null ? '#FDFBF7' : 'var(--text-secondary)',
          fontSize: 12,
          fontFamily: 'var(--font-body)',
          fontWeight: value === null ? 600 : 500,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        All days
      </button>
      {days.map((d) => {
        const active = value === d;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(active ? null : d)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: active ? 'none' : '1px solid var(--border-light)',
              background: active ? 'var(--color-gold-dark)' : 'transparent',
              color: active ? '#FDFBF7' : 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'var(--font-body)',
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {formatWeekdayShort(d, { fallback: d })}
          </button>
        );
      })}
    </div>
  );
}

function SectionHeader({ title, subtitle, top }: { title: string; subtitle?: string; top?: number }) {
  return (
    <div style={{ marginTop: top ?? 0, marginBottom: 14 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function DayHeading({ date, name }: { date: string; name: string }) {
  const formatted = formatWeekdayShort(date);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
      {formatted && (
        <span style={{ fontSize: 11, color: 'var(--color-gold-dark)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)' }}>
          {formatted}
        </span>
      )}
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
        {name}
      </h3>
    </div>
  );
}

function ContactRow({
  name, category, phone, whatsapp, email, last,
}: {
  name: string;
  category: string | null;
  phone: string | null;
  whatsapp: boolean;
  email: string | null;
  last: boolean;
}) {
  const phoneDigits = phone ? phone.replace(/[^\d+]/g, '') : '';
  return (
    <div style={{ padding: '12px 14px', borderBottom: last ? 'none' : '1px solid var(--border-light)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>{name}</span>
        {category && (
          <span style={{ fontSize: 11, color: 'var(--color-gold-dark)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)' }}>
            {category}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
        {phone && (
          <a href={`tel:${phoneDigits}`} style={contactLink}>
            ☎ {phone}
          </a>
        )}
        {phone && whatsapp && (
          <a href={`https://wa.me/${phoneDigits.replace(/^\+/, '')}`} target="_blank" rel="noreferrer" style={contactLink}>
            WhatsApp
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} style={contactLink}>
            ✉ {email}
          </a>
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ ...cardStyle, padding: 28, textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', fontSize: 14 }}>
      {text}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  padding: 0,
  borderRadius: 14,
  background: 'var(--bg-pure-white)',
  border: '1px solid var(--border-light)',
  overflow: 'hidden',
};

const chip: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 20,
  background: 'var(--bg-soft-cream)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-body)',
};

const chipDeadline: React.CSSProperties = {
  ...chip,
  background: 'rgba(196,112,75,0.1)',
  color: 'var(--color-terracotta)',
};

const chipTodo: React.CSSProperties = {
  ...chip,
  background: 'rgba(255,180,60,0.12)',
  color: '#9B6B1F',
};

const chipNoOwner: React.CSSProperties = {
  ...chip,
  background: 'rgba(196,112,75,0.12)',
  color: 'var(--color-terracotta)',
  fontWeight: 600,
};

const contactLink: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-terracotta)',
  fontFamily: 'var(--font-body)',
  textDecoration: 'none',
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
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border-light)',
  background: 'var(--bg-pure-white)',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
  color: '#FDFBF7',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'var(--font-body)',
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
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
