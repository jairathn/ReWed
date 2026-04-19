'use client';

import { useState, useEffect, use, useCallback, useMemo } from 'react';
import GoogleSuggestionsCard from '@/components/dashboard/GoogleSuggestionsCard';
import { formatShortDate } from '@/lib/utils/date-format';
import { vendorColor } from '@/lib/utils/vendor-color';

const COUPLE_OWNER_ID = '__couple__';
const COUPLE_OWNER_COLOR = '#A8883F';

type Urgency = 'fresh' | 'yellow' | 'orange' | 'red';

interface Todo {
  id: string;
  meeting_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: 'high' | 'normal' | 'low';
  status: 'open' | 'completed';
  assigned_to_vendor_id: string | null;
  created_at: string;
  completed_at: string | null;
  completed_by_role: string | null;
  vendor_name: string | null;
  meeting_title: string | null;
  age_days: number;
  urgency: Urgency;
}

interface UrgencyCounts {
  fresh: number;
  yellow: number;
  orange: number;
  red: number;
}

const URGENCY_LABEL: Record<Urgency, string> = {
  red: '60+ days · urgent',
  orange: '45+ days · stale',
  yellow: '30+ days · aging',
  fresh: 'recent',
};

const URGENCY_BG: Record<Urgency, string> = {
  red: 'rgba(196, 67, 67, 0.10)',
  orange: 'rgba(218, 119, 53, 0.10)',
  yellow: 'rgba(218, 175, 53, 0.12)',
  fresh: 'transparent',
};

const URGENCY_BORDER: Record<Urgency, string> = {
  red: 'rgba(196, 67, 67, 0.40)',
  orange: 'rgba(218, 119, 53, 0.40)',
  yellow: 'rgba(218, 175, 53, 0.40)',
  fresh: 'var(--border-light)',
};

const URGENCY_TEXT: Record<Urgency, string> = {
  red: '#9B2222',
  orange: '#9B5217',
  yellow: '#7A5C0F',
  fresh: 'var(--text-tertiary)',
};

export default function TodosPage({
  params,
}: {
  params: Promise<{ weddingId: string }>;
}) {
  const { weddingId } = use(params);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [counts, setCounts] = useState<UrgencyCounts>({ fresh: 0, yellow: 0, orange: 0, red: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'completed' | 'all'>('open');
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [nudging, setNudging] = useState<string | null>(null);
  const [nudgeFlash, setNudgeFlash] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === 'all'
        ? `/api/v1/dashboard/weddings/${weddingId}/todos`
        : `/api/v1/dashboard/weddings/${weddingId}/todos?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      setTodos(data.data?.todos || []);
      setCounts(data.data?.urgency_counts || { fresh: 0, yellow: 0, orange: 0, red: 0 });
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [weddingId, filter]);

  useEffect(() => { load(); }, [load]);

  const toggleStatus = async (todo: Todo) => {
    const next = todo.status === 'open' ? 'completed' : 'open';
    await fetch(`/api/v1/dashboard/weddings/${weddingId}/todos/${todo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    await load();
  };

  const deleteTodo = async (id: string) => {
    if (!confirm('Delete this to-do?')) return;
    await fetch(`/api/v1/dashboard/weddings/${weddingId}/todos/${id}`, {
      method: 'DELETE',
    });
    await load();
  };

  const nudge = async (todo: Todo) => {
    setNudging(todo.id);
    setError('');
    setNudgeFlash(null);
    try {
      const res = await fetch(
        `/api/v1/dashboard/weddings/${weddingId}/todos/${todo.id}/nudge`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Could not send nudge');
      setNudgeFlash(`Sent reminder to ${data.data?.recipient}`);
      setTimeout(() => setNudgeFlash(null), 2400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send nudge');
    } finally {
      setNudging(null);
    }
  };

  const ownerUsage = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const t of todos) {
      if (t.status !== 'open') continue;
      const id = t.assigned_to_vendor_id || COUPLE_OWNER_ID;
      const name = t.vendor_name || 'Bride & Groom';
      const existing = map.get(id);
      if (existing) existing.count++;
      else map.set(id, { id, name, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [todos]);

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 220, height: 32, marginBottom: 16, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: '100%', height: 280, borderRadius: 16 }} />
      </div>
    );
  }

  const matchesOwner = (t: Todo) => {
    if (!ownerFilter) return true;
    if (ownerFilter === COUPLE_OWNER_ID) return !t.assigned_to_vendor_id;
    return t.assigned_to_vendor_id === ownerFilter;
  };

  const activeOwnerLabel = ownerFilter
    ? ownerUsage.find((o) => o.id === ownerFilter)?.name ?? null
    : null;

  const visible = todos.filter(matchesOwner);

  const urgent = visible.filter((t) => t.status === 'open' && (t.urgency === 'red' || t.urgency === 'orange'));
  const aging = visible.filter((t) => t.status === 'open' && t.urgency === 'yellow');
  const fresh = visible.filter((t) => t.status === 'open' && t.urgency === 'fresh');
  const done = visible.filter((t) => t.status === 'completed');

  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={headingStyle}>To-dos</h1>
        <p style={subtitleStyle}>
          Action items extracted from meetings, plus anything you add manually. Items aged over 30, 45, and 60 days light up so nothing slips.
        </p>
      </div>

      <GoogleSuggestionsCard weddingId={weddingId} />

      {/* Urgency badges */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <UrgencyBadge urgency="red" count={counts.red} label="60+ days" />
        <UrgencyBadge urgency="orange" count={counts.orange} label="45+ days" />
        <UrgencyBadge urgency="yellow" count={counts.yellow} label="30+ days" />
        <UrgencyBadge urgency="fresh" count={counts.fresh} label="< 30 days" />
      </div>

      {/* Owner filter */}
      {ownerUsage.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'var(--bg-pure-white)',
            border: '1px solid var(--border-light)',
          }}
        >
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', fontWeight: 600, marginRight: 4 }}>
            Owner
          </span>
          <button
            type="button"
            onClick={() => setOwnerFilter(null)}
            style={todoFilterChipStyle(ownerFilter === null, null)}
          >
            Everyone
          </button>
          {ownerUsage.map((o) => {
            const active = ownerFilter === o.id;
            const color = o.id === COUPLE_OWNER_ID ? COUPLE_OWNER_COLOR : vendorColor(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setOwnerFilter(active ? null : o.id)}
                style={todoFilterChipStyle(active, color)}
              >
                <span
                  aria-hidden
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: active ? '#FDFBF7' : color,
                    display: 'inline-block',
                    marginRight: 5,
                    verticalAlign: 'middle',
                  }}
                />
                {o.name} · {o.count}
              </button>
            );
          })}
          {activeOwnerLabel && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
              {visible.length} of {todos.length}
            </span>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {([
          { id: 'open' as const, label: `Open (${visible.filter((t) => t.status === 'open').length})` },
          { id: 'completed' as const, label: 'Completed' },
          { id: 'all' as const, label: 'All' },
        ]).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '6px 12px',
              borderRadius: 10,
              border: 'none',
              background: filter === f.id ? 'rgba(198,163,85,0.10)' : 'transparent',
              color: filter === f.id ? 'var(--color-gold-dark)' : 'var(--text-secondary)',
              fontSize: 12,
              fontFamily: 'var(--font-body)',
              fontWeight: filter === f.id ? 500 : 400,
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {nudgeFlash && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 10,
            background: 'rgba(122,139,92,0.08)',
            color: 'var(--color-olive-dark, #5A6B45)',
            fontSize: 13,
            fontFamily: 'var(--font-body)',
          }}
        >
          {nudgeFlash}
        </div>
      )}

      {error && (
        <p style={{ marginBottom: 12, fontSize: 13, color: 'var(--color-terracotta)', fontFamily: 'var(--font-body)' }}>
          {error}
        </p>
      )}

      {filter === 'open' && (
        <>
          {urgent.length > 0 && (
            <Section title="Needs your attention" todos={urgent} onToggle={toggleStatus} onDelete={deleteTodo} onNudge={nudge} nudging={nudging} />
          )}
          {aging.length > 0 && (
            <Section title="Aging" todos={aging} onToggle={toggleStatus} onDelete={deleteTodo} onNudge={nudge} nudging={nudging} />
          )}
          {fresh.length > 0 && (
            <Section title="Recent" todos={fresh} onToggle={toggleStatus} onDelete={deleteTodo} onNudge={nudge} nudging={nudging} />
          )}
          {urgent.length + aging.length + fresh.length === 0 && <Empty text="No open to-dos." />}
        </>
      )}

      {filter === 'completed' && (
        done.length === 0
          ? <Empty text="Nothing completed yet." />
          : <Section title="Completed" todos={done} onToggle={toggleStatus} onDelete={deleteTodo} onNudge={nudge} nudging={nudging} />
      )}

      {filter === 'all' && (
        todos.length === 0
          ? <Empty text="No to-dos yet." />
          : <Section title="Everything" todos={todos} onToggle={toggleStatus} onDelete={deleteTodo} onNudge={nudge} nudging={nudging} />
      )}
    </div>
  );
}

function UrgencyBadge({ urgency, count, label }: { urgency: Urgency; count: number; label: string }) {
  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: 10,
        background: URGENCY_BG[urgency],
        border: `1px solid ${URGENCY_BORDER[urgency]}`,
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        fontFamily: 'var(--font-body)',
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 600, color: URGENCY_TEXT[urgency] }}>{count}</span>
      <span style={{ fontSize: 11, color: URGENCY_TEXT[urgency], textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
    </div>
  );
}

function Section({
  title, todos, onToggle, onDelete, onNudge, nudging,
}: {
  title: string;
  todos: Todo[];
  onToggle: (t: Todo) => void;
  onDelete: (id: string) => void;
  onNudge: (t: Todo) => void;
  nudging: string | null;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={sectionTitle}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {todos.map((t) => (
          <div
            key={t.id}
            style={{
              padding: 14,
              borderRadius: 12,
              background: t.status === 'completed' ? 'rgba(122,139,92,0.05)' : URGENCY_BG[t.urgency] || 'var(--bg-pure-white)',
              border: `1px solid ${URGENCY_BORDER[t.urgency]}`,
              opacity: t.status === 'completed' ? 0.65 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <input
                type="checkbox"
                checked={t.status === 'completed'}
                onChange={() => onToggle(t)}
                style={{ marginTop: 3, accentColor: 'var(--color-gold-dark)', cursor: 'pointer' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 14,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    textDecoration: t.status === 'completed' ? 'line-through' : 'none',
                  }}>
                    {t.title}
                  </span>
                  {t.priority === 'high' && t.status === 'open' && (
                    <span style={{ fontSize: 10, color: 'var(--color-terracotta)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                      High
                    </span>
                  )}
                  {t.status === 'open' && t.urgency !== 'fresh' && (
                    <span style={{
                      fontSize: 10,
                      color: URGENCY_TEXT[t.urgency],
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                    }}>
                      {URGENCY_LABEL[t.urgency]}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {(() => {
                    const color = t.assigned_to_vendor_id
                      ? vendorColor(t.assigned_to_vendor_id)
                      : COUPLE_OWNER_COLOR;
                    const ownerName = t.vendor_name || 'Bride & Groom';
                    return (
                      <span
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
                        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: color, display: 'inline-block' }} />
                        {ownerName}
                      </span>
                    );
                  })()}
                  {t.due_date && <span>· due {formatShortDate(t.due_date)}</span>}
                  {t.meeting_title && <span>· from &ldquo;{t.meeting_title}&rdquo;</span>}
                  {t.status === 'open' && <span>· open {t.age_days}d</span>}
                </div>
                {t.description && (
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                    {t.description}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {t.status === 'open' && (
                  <button
                    onClick={() => onNudge(t)}
                    disabled={nudging === t.id}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border-light)',
                      background: 'var(--bg-pure-white)',
                      color: 'var(--color-gold-dark)',
                      fontSize: 11,
                      fontFamily: 'var(--font-body)',
                      cursor: nudging === t.id ? 'default' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    title="Send a reminder email"
                  >
                    {nudging === t.id ? 'Sending…' : 'Nudge'}
                  </button>
                )}
                <button
                  onClick={() => onDelete(t.id)}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-tertiary)',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{
      padding: 28,
      textAlign: 'center',
      borderRadius: 16,
      background: 'var(--bg-pure-white)',
      border: '1px solid var(--border-light)',
      color: 'var(--text-secondary)',
      fontFamily: 'var(--font-body)',
      fontSize: 14,
    }}>
      {text}
    </div>
  );
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
function todoFilterChipStyle(active: boolean, color: string | null): React.CSSProperties {
  return {
    padding: '5px 11px',
    borderRadius: 999,
    border: active ? 'none' : '1px solid var(--border-light)',
    background: active ? (color ?? 'var(--color-terracotta)') : 'var(--bg-pure-white)',
    color: active ? '#FDFBF7' : 'var(--text-primary)',
    fontSize: 12,
    fontFamily: 'var(--font-body)',
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s',
  };
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text-tertiary)',
  margin: '0 0 10px',
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
};
