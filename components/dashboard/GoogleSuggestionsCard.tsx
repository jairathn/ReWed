'use client';

import { useState, useEffect, useCallback } from 'react';

interface ConnectionStatus {
  configured: boolean;
  connected: boolean;
  connection: {
    email: string;
    gmail_enabled: boolean;
    drive_enabled: boolean;
    last_scanned_at: string | null;
    last_drive_scanned_at: string | null;
    connected_at: string;
    backfill_from_date: string | null;
    backfill_completed_at: string | null;
    last_synced_at: string | null;
    backfill_page_token: string | null;
  } | null;
  knowledge: {
    thread_count: number;
    extracted_count: number;
    fact_count: number;
    unextracted_count: number;
  };
}

interface IngestState {
  backfill_from_date: string | null;
  backfill_completed_at: string | null;
  last_synced_at: string | null;
  backfill_page_token: string | null;
  registered_total: number;
  extracted_total: number;
  unextracted_count: number;
}

interface IngestResult {
  phase: 'register' | 'extract' | 'done' | 'idle';
  registered?: number;
  extracted?: number;
  failed?: number;
  discovered?: number;
  reachedEndOfBackfill?: boolean;
  state: IngestState;
}

interface Suggestion {
  id: string;
  source_type: string;
  source_ref: string;
  source_summary: string | null;
  source_url: string | null;
  action_type: 'create_todo' | 'update_todo' | 'update_timeline';
  payload: Record<string, unknown>;
  rationale: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
}

export default function GoogleSuggestionsCard({ weddingId }: { weddingId: string }) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, gRes] = await Promise.all([
        fetch(`/api/v1/dashboard/weddings/${weddingId}/suggestions?status=pending`),
        fetch(`/api/v1/dashboard/weddings/${weddingId}/google`),
      ]);
      const sData = await sRes.json();
      const gData = await gRes.json();
      setSuggestions(sData.data?.suggestions || []);
      setStatus(gData.data || null);
    } catch {
      setError('Could not load Google integration status');
    } finally {
      setLoading(false);
    }
  }, [weddingId]);

  useEffect(() => { load(); }, [load]);

  // Surface OAuth callback messages from query string.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected')) {
      setFlash('Google account connected.');
      // Clean the URL so refreshes don't repeat the toast.
      const u = new URL(window.location.href);
      u.searchParams.delete('google_connected');
      window.history.replaceState({}, '', u.toString());
    }
    if (params.get('google_error')) {
      setError(`Google connection failed: ${params.get('google_error')}`);
      const u = new URL(window.location.href);
      u.searchParams.delete('google_error');
      window.history.replaceState({}, '', u.toString());
    }
  }, []);

  const analyze = async () => {
    setScanning(true);
    setError('');
    setFlash('');
    try {
      const res = await fetch(
        `/api/v1/dashboard/weddings/${weddingId}/google/analyze`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Analyze failed');
      setFlash(
        `Scanned ${data.data?.emails_scanned || 0} emails and ${data.data?.files_scanned || 0} files. ${data.data?.suggestions_created || 0} new suggestion${data.data?.suggestions_created === 1 ? '' : 's'}.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyze failed');
    } finally {
      setScanning(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Google? Suggestions already created will stay in your inbox.')) return;
    await fetch(`/api/v1/dashboard/weddings/${weddingId}/google`, { method: 'DELETE' });
    await load();
  };

  /**
   * Run the ingest loop: call POST /google/ingest repeatedly until the server
   * reports phase === 'done'. The serverless endpoint bounds work per call so
   * one invocation is always fast; we loop here to chip through the whole
   * backfill. Aborts cleanly on error or if the user reloads the page.
   */
  const runSync = async (opts: { mode?: 'batch' | 'incremental'; fromDate?: string } = {}) => {
    if (syncing) return;
    setSyncing(true);
    setError('');
    setFlash('');

    const maxIterations = 200; // hard cap so a bad server response can't loop forever
    let iterations = 0;
    let totalRegistered = 0;
    let totalExtracted = 0;
    let discovered = 0;

    try {
      while (iterations < maxIterations) {
        iterations += 1;
        const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/google/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: iterations === 1 ? opts.mode ?? 'batch' : 'batch',
            from_date: opts.fromDate,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || 'Sync failed');
        const result = (json.data as IngestResult) ?? { phase: 'idle', state: {} as IngestState };

        totalRegistered += result.registered ?? 0;
        totalExtracted += result.extracted ?? 0;
        discovered += result.discovered ?? 0;

        const s = result.state;
        if (result.phase === 'register') {
          setSyncProgress(
            `Registering threads… ${s.registered_total} indexed so far`
          );
        } else if (result.phase === 'extract') {
          setSyncProgress(
            `Extracting facts… ${s.extracted_total} of ${s.registered_total} threads done`
          );
        } else {
          setSyncProgress('');
          break;
        }
      }

      setFlash(
        `Sync done. ${totalRegistered} thread${totalRegistered === 1 ? '' : 's'} indexed` +
          (discovered ? ` (+${discovered} new)` : '') +
          `, ${totalExtracted} fact${totalExtracted === 1 ? '' : 's'} extracted.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  };

  const resolve = async (id: string, action: 'accept' | 'decline') => {
    setActing(id);
    setError('');
    try {
      const res = await fetch(
        `/api/v1/dashboard/weddings/${weddingId}/suggestions/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Action failed');
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <div className="skeleton" style={{ width: '100%', height: 140, borderRadius: 16, marginBottom: 20 }} />;
  }
  if (!status) return null;

  if (!status.configured) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={iconWrap}>{googleIcon}</div>
          <h3 style={cardLabel}>Gmail + Drive (setup required)</h3>
        </div>
        <p style={subtitle}>
          Connect a Google account so the AI can scan recent emails and Drive files for changes that should become to-dos or timeline updates. Setup takes about 10 minutes — see <code>SETUP_GMAIL.md</code> for the Google Cloud steps.
        </p>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={iconWrap}>{googleIcon}</div>
          <h3 style={cardLabel}>Connect Gmail + Drive</h3>
        </div>
        <p style={subtitle}>
          Let the AI read recent emails and Drive files and surface changes you should consider. You stay in control — every suggestion needs your accept or decline.
        </p>
        <a
          href={`/api/v1/dashboard/weddings/${weddingId}/google/connect`}
          style={primaryBtn}
        >
          Connect with Google
        </a>
        {error && <p style={errorText}>{error}</p>}
      </div>
    );
  }

  const conn = status.connection!;
  const lastScan = conn.last_scanned_at || conn.last_drive_scanned_at;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={iconWrap}>{googleIcon}</div>
          <div>
            <h3 style={cardLabel}>Gmail + Drive</h3>
            <p style={{ ...subtitle, margin: '2px 0 0', fontSize: 12 }}>
              Connected as {conn.email}
              {' · '}
              {[conn.gmail_enabled && 'Gmail', conn.drive_enabled && 'Drive']
                .filter(Boolean)
                .join(' + ')}
              {lastScan && ` · last scanned ${formatRelative(lastScan)}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={analyze} disabled={scanning} style={primaryBtn}>
            {scanning ? 'Scanning…' : 'Analyze emails + Drive'}
          </button>
          <button onClick={disconnect} style={ghostBtn}>Disconnect</button>
        </div>
      </div>

      {flash && <p style={flashText}>{flash}</p>}
      {error && <p style={errorText}>{error}</p>}

      <KnowledgeBaseSection
        connection={conn}
        knowledge={status.knowledge}
        syncing={syncing}
        syncProgress={syncProgress}
        onSync={(opts) => runSync(opts)}
        weddingId={weddingId}
      />

      {suggestions.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {suggestions.map((s) => (
            <SuggestionRow
              key={s.id}
              suggestion={s}
              busy={acting === s.id}
              onAccept={() => resolve(s.id, 'accept')}
              onDecline={() => resolve(s.id, 'decline')}
            />
          ))}
        </div>
      )}

      {suggestions.length === 0 && !flash && (
        <p style={{ ...subtitle, marginTop: 12, fontSize: 12 }}>
          No pending suggestions. Click <strong>Analyze emails + Drive</strong> to scan your recent inbox and files.
        </p>
      )}
    </div>
  );
}

function SuggestionRow({
  suggestion: s, busy, onAccept, onDecline,
}: {
  suggestion: Suggestion;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const summary = describeSuggestion(s);
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: '1px solid var(--border-light)',
        background: 'var(--bg-soft-cream)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--color-gold-dark)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
              {actionLabel(s.action_type)}
            </span>
            <span style={{ fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
              {summary}
            </span>
          </div>
          {s.rationale && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
              {s.rationale}
            </p>
          )}
          {s.source_summary && (
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>
              Source: {s.source_summary}
              {s.source_url && (
                <> · <a href={s.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-gold-dark)' }}>open</a></>
              )}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onAccept} disabled={busy} style={acceptBtn}>
            {busy ? '…' : 'Accept'}
          </button>
          <button onClick={onDecline} disabled={busy} style={declineBtn}>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

function actionLabel(t: Suggestion['action_type']): string {
  if (t === 'create_todo') return 'New to-do';
  if (t === 'update_todo') return 'Update to-do';
  return 'Update timeline';
}

function describeSuggestion(s: Suggestion): string {
  const p = s.payload;
  if (s.action_type === 'create_todo') {
    return (p.title as string) || 'New to-do';
  }
  if (s.action_type === 'update_todo') {
    const match = p.todo_match as string;
    const status = p.new_status as string;
    const due = p.new_due_date as string;
    const bits = [`"${match}"`];
    if (status) bits.push(`→ ${status}`);
    if (due) bits.push(`due ${due}`);
    return bits.join(' ');
  }
  if (s.action_type === 'update_timeline') {
    const match = p.entry_match as string;
    return `"${match}"`;
  }
  return 'Suggestion';
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const minutes = Math.round((Date.now() - d.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const cardStyle: React.CSSProperties = {
  padding: 18,
  borderRadius: 16,
  background: 'var(--bg-pure-white)',
  border: '1px solid var(--border-light)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
  marginBottom: 20,
};
const cardLabel: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-primary)',
  margin: 0,
  fontFamily: 'var(--font-body)',
};
const subtitle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-secondary)',
  margin: '4px 0 12px',
  fontFamily: 'var(--font-body)',
  lineHeight: 1.55,
};
const iconWrap: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: 'rgba(198,163,85,0.10)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};
const primaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: 'none',
  background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
  color: '#FDFBF7',
  fontSize: 12,
  fontWeight: 500,
  fontFamily: 'var(--font-body)',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  whiteSpace: 'nowrap',
};
const ghostBtn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid var(--border-light)',
  background: 'var(--bg-pure-white)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  fontFamily: 'var(--font-body)',
  cursor: 'pointer',
};
const acceptBtn: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: 'none',
  background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
  color: '#FDFBF7',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'var(--font-body)',
  cursor: 'pointer',
};
const declineBtn: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--border-light)',
  background: 'var(--bg-pure-white)',
  color: 'var(--text-secondary)',
  fontSize: 11,
  fontFamily: 'var(--font-body)',
  cursor: 'pointer',
};
const flashText: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-olive-dark, #5A6B45)',
  background: 'rgba(122,139,92,0.08)',
  padding: '6px 10px',
  borderRadius: 8,
  margin: '0 0 8px',
  fontFamily: 'var(--font-body)',
};
const errorText: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-terracotta)',
  margin: '8px 0 0',
  fontFamily: 'var(--font-body)',
};

const googleIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M21.35 11.1H12v3.2h5.35c-.5 2.4-2.55 3.6-5.35 3.6a6 6 0 110-12c1.5 0 2.85.55 3.9 1.45l2.4-2.4A9.5 9.5 0 0012 2a10 10 0 100 20c5.75 0 9.55-4.05 9.55-9.75 0-.4 0-.85-.2-1.15z" fill="var(--color-gold-dark)" />
  </svg>
);

function KnowledgeBaseSection({
  connection,
  knowledge,
  syncing,
  syncProgress,
  onSync,
  weddingId,
}: {
  connection: NonNullable<ConnectionStatus['connection']>;
  knowledge: ConnectionStatus['knowledge'];
  syncing: boolean;
  syncProgress: string;
  onSync: (opts: { mode?: 'batch' | 'incremental'; fromDate?: string }) => void;
  weddingId: string;
}) {
  const neverStarted =
    !connection.backfill_from_date && knowledge.thread_count === 0;
  const backfillDone = !!connection.backfill_completed_at;
  const inFlight = !backfillDone && knowledge.thread_count > 0;
  const pct =
    knowledge.thread_count > 0
      ? Math.round((knowledge.extracted_count / knowledge.thread_count) * 100)
      : 0;

  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        borderRadius: 12,
        background: 'var(--bg-soft-cream)',
        border: '1px solid var(--border-light)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--color-gold-dark)',
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
            }}
          >
            Knowledge base
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontWeight: 500, marginTop: 2 }}>
            {knowledge.fact_count} fact{knowledge.fact_count === 1 ? '' : 's'} from {knowledge.thread_count} thread{knowledge.thread_count === 1 ? '' : 's'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginTop: 2 }}>
            {neverStarted
              ? 'Build a month-by-month knowledge base from your inbox. Facts power the chatbot and auto-todos.'
              : backfillDone
              ? `Backfill complete from ${connection.backfill_from_date}. ${connection.last_synced_at ? `Last synced ${formatRelative(connection.last_synced_at)}.` : ''}`
              : inFlight
              ? `Backfill in progress from ${connection.backfill_from_date}. ${knowledge.unextracted_count} thread${knowledge.unextracted_count === 1 ? '' : 's'} left to extract.`
              : `Ready to backfill from ${connection.backfill_from_date}.`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a
            href={`/dashboard/${weddingId}/facts`}
            style={{ ...ghostBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            View facts
          </a>
          {neverStarted && (
            <button
              onClick={() => onSync({ mode: 'batch' })}
              disabled={syncing}
              style={primaryBtn}
            >
              {syncing ? 'Starting…' : 'Start syncing'}
            </button>
          )}
          {(inFlight || knowledge.unextracted_count > 0) && !neverStarted && (
            <button
              onClick={() => onSync({ mode: 'batch' })}
              disabled={syncing}
              style={primaryBtn}
            >
              {syncing ? 'Syncing…' : 'Continue sync'}
            </button>
          )}
          {backfillDone && knowledge.unextracted_count === 0 && (
            <button
              onClick={() => onSync({ mode: 'incremental' })}
              disabled={syncing}
              style={primaryBtn}
            >
              {syncing ? 'Checking…' : 'Check for new'}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {knowledge.thread_count > 0 && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              height: 6,
              borderRadius: 999,
              background: 'var(--bg-pure-white)',
              border: '1px solid var(--border-light)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--color-olive), var(--color-gold))',
                transition: 'width 0.4s',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: 'var(--font-body)' }}>
            {knowledge.extracted_count} of {knowledge.thread_count} extracted · {pct}%
          </div>
        </div>
      )}

      {/* Live progress line while the loop is running */}
      {syncing && syncProgress && (
        <p style={{ fontSize: 12, color: 'var(--color-gold-dark)', margin: '8px 0 0', fontFamily: 'var(--font-body)' }}>
          {syncProgress}
        </p>
      )}
    </div>
  );
}
