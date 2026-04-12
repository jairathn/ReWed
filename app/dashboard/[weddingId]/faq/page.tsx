'use client';

import { useState, useEffect, useCallback, use } from 'react';
import PasswordConfirmDialog from '@/components/ui/PasswordConfirmDialog';

interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  source: 'manual' | 'zola_import' | 'generated';
  created_at: string;
}

interface ParsedFaq {
  question: string;
  answer: string;
}

type View = 'list' | 'add' | 'edit' | 'import';

export default function FaqPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const [entries, setEntries] = useState<FaqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [error, setError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Form state
  const [editEntry, setEditEntry] = useState<FaqEntry | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  // Bulk import
  const [bulkText, setBulkText] = useState('');
  const [importParsed, setImportParsed] = useState<ParsedFaq[] | null>(null);
  const [importResult, setImportResult] = useState<{ count: number } | null>(null);

  // Delete confirmation (password-gated)
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; question: string } | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/faq`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [weddingId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const resetForm = () => {
    setEditEntry(null);
    setQuestion('');
    setAnswer('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setError('');

    try {
      const url = editEntry
        ? `/api/v1/dashboard/weddings/${weddingId}/faq/${editEntry.id}`
        : `/api/v1/dashboard/weddings/${weddingId}/faq`;

      const res = await fetch(url, {
        method: editEntry ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message || 'Failed to save');
        return;
      }

      resetForm();
      setView('list');
      fetchEntries();
    } catch {
      setError('Network error');
    } finally {
      setFormLoading(false);
    }
  };

  // ── Detect Zola doubled-question format ──
  const parseDoubledQuestion = (line: string): string | null => {
    const trimmed = line.trim();
    if (!trimmed.includes('?')) return null;
    const firstQ = trimmed.indexOf('?');
    const candidate = trimmed.substring(0, firstQ + 1);
    const rest = trimmed.substring(firstQ + 1);
    if (candidate.length > 5 && rest.trim() === candidate.trim()) {
      return candidate.trim();
    }
    return null;
  };

  const parseZolaFormat = (text: string): ParsedFaq[] => {
    const lines = text.split(/\r?\n/);
    const results: ParsedFaq[] = [];
    let currentQuestion: string | null = null;
    let currentAnswerLines: string[] = [];

    for (const line of lines) {
      const doubled = parseDoubledQuestion(line);
      if (doubled) {
        if (currentQuestion && currentAnswerLines.length > 0) {
          const ans = currentAnswerLines.join('\n').trim();
          if (ans) results.push({ question: currentQuestion, answer: ans });
        }
        currentQuestion = doubled;
        currentAnswerLines = [];
      } else if (currentQuestion !== null) {
        currentAnswerLines.push(line);
      }
    }
    if (currentQuestion && currentAnswerLines.length > 0) {
      const ans = currentAnswerLines.join('\n').trim();
      if (ans) results.push({ question: currentQuestion, answer: ans });
    }
    return results;
  };

  const parseQAFormat = (text: string): ParsedFaq[] => {
    const pairs = text.split(/\n\n+/).filter(Boolean);
    const results: ParsedFaq[] = [];
    for (const pair of pairs) {
      const lines = pair.split('\n');
      let q = '';
      let a = '';
      for (const line of lines) {
        if (line.match(/^Q:\s*/i)) q = line.replace(/^Q:\s*/i, '').trim();
        else if (line.match(/^A:\s*/i)) a = line.replace(/^A:\s*/i, '').trim();
        else if (q && !a) q += ' ' + line.trim();
        else if (a) a += ' ' + line.trim();
      }
      if (q && a) results.push({ question: q, answer: a });
    }
    return results;
  };

  const isZolaFormat = (text: string): boolean => {
    const lines = text.split(/\r?\n/);
    let count = 0;
    for (const line of lines) {
      if (parseDoubledQuestion(line)) count++;
      if (count >= 2) return true;
    }
    return false;
  };

  // ── Parse locally first, then fall back to LLM ──
  const handleImportPreview = async () => {
    if (!bulkText.trim()) return;
    setFormLoading(true);
    setError('');

    // Try local parsing first
    let parsed: ParsedFaq[] = [];
    if (isZolaFormat(bulkText)) {
      parsed = parseZolaFormat(bulkText);
    } else {
      parsed = parseQAFormat(bulkText);
    }

    if (parsed.length > 0) {
      setImportParsed(parsed);
      setFormLoading(false);
      return;
    }

    // Fall back to LLM parsing
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/faq/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: bulkText, step: 'preview' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Could not parse Q&A pairs. Try using Q:/A: format or paste directly from Zola.');
        return;
      }
      setImportParsed(data.entries);
    } catch {
      setError('Network error');
    } finally {
      setFormLoading(false);
    }
  };

  const handleImportConfirm = async () => {
    if (!importParsed || importParsed.length === 0) return;
    setFormLoading(true);
    setError('');

    try {
      const source = isZolaFormat(bulkText) ? 'zola_import' : 'manual';
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/faq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: importParsed, source }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message || 'Import failed');
        return;
      }

      const data = await res.json();
      setImportResult({ count: data.count });
      fetchEntries();
    } catch {
      setError('Network error');
    } finally {
      setFormLoading(false);
    }
  };

  const performDelete = async (entryId: string) => {
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/faq/${entryId}`, { method: 'DELETE' });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
      }
    } catch {
      // Silently fail
    } finally {
      setConfirmDelete(null);
    }
  };

  const startEdit = (entry: FaqEntry) => {
    setEditEntry(entry);
    setQuestion(entry.question);
    setAnswer(entry.answer);
    setView('edit');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 10,
    border: '1.5px solid var(--border-medium)',
    background: 'var(--bg-soft-cream)',
    fontSize: 14,
    fontFamily: 'var(--font-body)',
    color: 'var(--text-primary)',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 4,
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)',
  };

  // ─── Import View ───
  if (view === 'import') {
    // Import complete
    if (importResult) {
      return (
        <div style={{ maxWidth: 600 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
            Import Complete
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginBottom: 24 }}>Your FAQ entries have been imported successfully.</p>
          <div style={{ padding: 24, background: 'var(--bg-pure-white)', borderRadius: 16, border: '1px solid var(--border-light)' }}>
            <div style={{ textAlign: 'center', padding: 16, borderRadius: 12, background: 'rgba(122, 139, 92, 0.08)', marginBottom: 20 }}>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-olive)', margin: 0 }}>{importResult.count}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>FAQ entries imported</p>
            </div>
            <button onClick={() => { setView('list'); setBulkText(''); setImportParsed(null); setImportResult(null); }} style={{ background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', fontWeight: 600, fontFamily: 'var(--font-body)', border: 'none', cursor: 'pointer', padding: '8px 16px' }}>
              View FAQ
            </button>
          </div>
        </div>
      );
    }

    // Preview parsed entries
    if (importParsed) {
      return (
        <div style={{ maxWidth: 700 }}>
          <button
            onClick={() => setImportParsed(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, fontFamily: 'var(--font-body)' }}
          >
            &larr; Back to text
          </button>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
            Review Parsed FAQ
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
            {importParsed.length} Q&A pair{importParsed.length !== 1 ? 's' : ''} detected. Review below, then import.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {importParsed.map((faq, i) => (
              <div key={i} style={{ padding: 16, background: 'var(--bg-pure-white)', borderRadius: 16, border: '1px solid var(--border-light)' }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                  {faq.question}
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>

          {error && <p style={{ color: 'var(--color-terracotta)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={handleImportConfirm} disabled={formLoading} style={{ background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', fontWeight: 600, fontFamily: 'var(--font-body)', border: 'none', cursor: 'pointer', padding: '8px 16px', opacity: formLoading ? 0.5 : 1 }}>
              {formLoading ? 'Importing...' : `Import ${importParsed.length} Entries`}
            </button>
            <button onClick={() => setImportParsed(null)} style={{ border: '1px solid var(--border-light)', borderRadius: 10, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer', padding: '8px 16px' }}>
              Back
            </button>
          </div>
        </div>
      );
    }

    // Text input
    return (
      <div style={{ maxWidth: 600 }}>
        <button
          onClick={() => { setView('list'); setBulkText(''); setError(''); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, fontFamily: 'var(--font-body)' }}
        >
          &larr; Back to FAQ
        </button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
          Import FAQ
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
          Paste your FAQ content below. Supports copy-paste from Zola, The Knot, Q:/A: format, or any free-form text with questions and answers — we&apos;ll use AI to extract them.
        </p>

        <div style={{ padding: 24, background: 'var(--bg-pure-white)', borderRadius: 16, border: '1px solid var(--border-light)' }}>
          <textarea
            style={{ ...inputStyle, minHeight: 200, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'Paste FAQ content here...\n\nSupported formats:\n• Copy-paste from Zola or The Knot\n• Q: What is the dress code?\n  A: Formal attire.\n• Or any free-form text with Q&A'}
          />

          {error && <p style={{ color: 'var(--color-terracotta)', fontSize: 13, marginTop: 12 }}>{error}</p>}

          <button
            onClick={handleImportPreview}
            disabled={!bulkText.trim() || formLoading}
            style={{ marginTop: 16, opacity: !bulkText.trim() || formLoading ? 0.5 : 1, background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', fontWeight: 600, fontFamily: 'var(--font-body)', border: 'none', cursor: 'pointer', padding: '8px 16px' }}
          >
            {formLoading ? 'Analyzing...' : 'Parse FAQ'}
          </button>
        </div>
      </div>
    );
  }

  // ─── Add/Edit Form ───
  if (view === 'add' || view === 'edit') {
    return (
      <div style={{ maxWidth: 600 }}>
        <button
          onClick={() => { resetForm(); setView('list'); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, fontFamily: 'var(--font-body)' }}
        >
          &larr; Back to FAQ
        </button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
          {view === 'edit' ? 'Edit FAQ Entry' : 'Add FAQ Entry'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginBottom: 24 }}>
          {view === 'edit' ? 'Update the question and answer below.' : 'Add a new question and answer for your guests.'}
        </p>

        <form onSubmit={handleSubmit} style={{ padding: 24, background: 'var(--bg-pure-white)', borderRadius: 16, border: '1px solid var(--border-light)' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Question *</label>
            <input style={inputStyle} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should I wear?" required />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Answer *</label>
            <textarea
              style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="The ceremony is formal attire. Please wear..."
              required
            />
          </div>
          {error && <p style={{ color: 'var(--color-terracotta)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" disabled={formLoading} style={{ background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', fontWeight: 600, fontFamily: 'var(--font-body)', border: 'none', cursor: 'pointer', padding: '8px 16px', opacity: formLoading ? 0.7 : 1 }}>
              {formLoading ? 'Saving...' : view === 'edit' ? 'Update' : 'Add Entry'}
            </button>
            <button type="button" onClick={() => { resetForm(); setView('list'); }} style={{ border: '1px solid var(--border-light)', borderRadius: 10, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer', padding: '8px 16px' }}>Cancel</button>
          </div>
        </form>
      </div>
    );
  }

  // ─── FAQ List ───
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
            FAQ
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginTop: 4 }}>
            {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'} — Powers the guest FAQ chatbot
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setView('import'); setBulkText(''); setImportParsed(null); setImportResult(null); setError(''); }} style={{ fontSize: 13, padding: '8px 16px', border: '1px solid var(--border-light)', borderRadius: 10, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer' }}>
            Import FAQ
          </button>
          <button onClick={() => { resetForm(); setView('add'); }} style={{ fontSize: 13, padding: '8px 16px', background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', fontWeight: 600, fontFamily: 'var(--font-body)', border: 'none', cursor: 'pointer' }}>
            + Add Entry
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ borderRadius: 16, background: 'var(--bg-pure-white)', border: '1px solid var(--border-light)', padding: 24 }}>
          <div className="skeleton" style={{ width: '100%', height: 200 }} />
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', background: 'var(--bg-pure-white)', borderRadius: 16, border: '1px solid var(--border-light)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px' }}>
            <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>No FAQ entries yet</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16, maxWidth: 400, margin: '0 auto 16px' }}>
            Add common questions and answers so the AI chatbot can help your guests.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => { setView('import'); setBulkText(''); setImportParsed(null); setImportResult(null); setError(''); }} style={{ fontSize: 13, border: '1px solid var(--border-light)', borderRadius: 10, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer', padding: '8px 16px' }}>Import FAQ</button>
            <button onClick={() => { resetForm(); setView('add'); }} style={{ fontSize: 13, background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', fontWeight: 600, fontFamily: 'var(--font-body)', border: 'none', cursor: 'pointer', padding: '8px 16px' }}>+ Add First Entry</button>
          </div>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries.map((entry) => (
            <div key={entry.id} style={{ padding: 20, background: 'var(--bg-pure-white)', borderRadius: 16, border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                    {entry.question}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                    {entry.answer}
                  </p>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6, display: 'inline-block', background: 'var(--bg-soft-cream)', padding: '1px 6px', borderRadius: 999 }}>
                    {entry.source}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
                  <button onClick={() => startEdit(entry)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-terracotta)' }}>
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ id: entry.id, question: entry.question })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PasswordConfirmDialog
        open={confirmDelete !== null}
        title="Delete FAQ entry?"
        description={
          confirmDelete ? (
            <>
              This will permanently remove <strong>&ldquo;{confirmDelete.question}&rdquo;</strong>{' '}
              from your FAQ. This cannot be undone. Enter your password to confirm.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete entry"
        onConfirm={async () => {
          if (confirmDelete) await performDelete(confirmDelete.id);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
