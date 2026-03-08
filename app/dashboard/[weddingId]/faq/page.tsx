'use client';

import { useState, useEffect, useCallback, use } from 'react';

interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  source: 'manual' | 'zola_import' | 'generated';
  created_at: string;
}

type View = 'list' | 'add' | 'edit';

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
  const [showBulk, setShowBulk] = useState(false);

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

  // Detect if a line is a Zola-style doubled question like "Question?Question?"
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

  const parseZolaFormat = (text: string): { question: string; answer: string }[] => {
    const lines = text.split(/\r?\n/);
    const results: { question: string; answer: string }[] = [];
    let currentQuestion: string | null = null;
    let currentAnswerLines: string[] = [];

    for (const line of lines) {
      const doubled = parseDoubledQuestion(line);
      if (doubled) {
        // Save previous Q&A if exists
        if (currentQuestion && currentAnswerLines.length > 0) {
          const answer = currentAnswerLines.join('\n').trim();
          if (answer) results.push({ question: currentQuestion, answer });
        }
        currentQuestion = doubled;
        currentAnswerLines = [];
      } else if (currentQuestion !== null) {
        currentAnswerLines.push(line);
      }
    }
    // Save last Q&A
    if (currentQuestion && currentAnswerLines.length > 0) {
      const answer = currentAnswerLines.join('\n').trim();
      if (answer) results.push({ question: currentQuestion, answer });
    }
    return results;
  };

  const isZolaFormat = (text: string): boolean => {
    const lines = text.split(/\r?\n/);
    let doubledCount = 0;
    for (const line of lines) {
      if (parseDoubledQuestion(line)) doubledCount++;
      if (doubledCount >= 2) return true;
    }
    return false;
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    setFormLoading(true);
    setError('');

    let parsed: { question: string; answer: string }[] = [];

    if (isZolaFormat(bulkText)) {
      // Zola copy-paste: "Question?Question?\nAnswer lines..."
      parsed = parseZolaFormat(bulkText);
    } else {
      // Standard format: Q: question\nA: answer (separated by blank lines)
      const pairs = bulkText.split(/\n\n+/).filter(Boolean);

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
        if (q && a) parsed.push({ question: q, answer: a });
      }
    }

    if (parsed.length === 0) {
      setError('No valid Q&A pairs found. Supports Zola copy-paste format or Q:/A: format (separated by blank lines).');
      setFormLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/faq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: parsed, source: isZolaFormat(bulkText) ? 'zola_import' : 'manual' }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message || 'Import failed');
        return;
      }

      const data = await res.json();
      setBulkText('');
      setShowBulk(false);
      setError('');
      fetchEntries();
      alert(`Imported ${data.count} FAQ entries`);
    } catch {
      setError('Network error');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    if (!confirm('Delete this FAQ entry?')) return;
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/faq/${entryId}`, { method: 'DELETE' });
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
      }
    } catch {
      // Silently fail
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
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 24 }}>
          {view === 'edit' ? 'Edit FAQ Entry' : 'Add FAQ Entry'}
        </h1>

        <form onSubmit={handleSubmit} className="card" style={{ padding: 24, background: 'var(--bg-pure-white)' }}>
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
            <button type="submit" className="btn-primary" disabled={formLoading} style={{ opacity: formLoading ? 0.7 : 1 }}>
              {formLoading ? 'Saving...' : view === 'edit' ? 'Update' : 'Add Entry'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => { resetForm(); setView('list'); }}>Cancel</button>
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
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
            FAQ
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'} — Powers the guest FAQ chatbot
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => setShowBulk(!showBulk)} style={{ fontSize: 13, padding: '8px 16px' }}>
            Bulk Import
          </button>
          <button className="btn-primary" onClick={() => { resetForm(); setView('add'); }} style={{ fontSize: 13, padding: '8px 16px' }}>
            + Add Entry
          </button>
        </div>
      </div>

      {/* Bulk Import */}
      {showBulk && (
        <div className="card" style={{ padding: 20, background: 'var(--bg-pure-white)', marginBottom: 20 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 8, color: 'var(--text-primary)' }}>
            Bulk Import FAQ
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Paste Q&A pairs below. Supports copy-paste directly from Zola, or use Q:/A: format with blank lines between pairs.
          </p>
          <textarea
            style={{ ...inputStyle, minHeight: 160, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'Q: What is the dress code?\nA: The ceremony is formal attire.\n\nQ: Where should I park?\nA: Free parking is available at the venue.'}
          />
          {error && <p style={{ color: 'var(--color-terracotta)', fontSize: 13, marginTop: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn-primary" onClick={handleBulkImport} disabled={formLoading || !bulkText.trim()} style={{ fontSize: 13, opacity: formLoading || !bulkText.trim() ? 0.5 : 1 }}>
              {formLoading ? 'Importing...' : 'Import'}
            </button>
            <button className="btn-ghost" onClick={() => { setShowBulk(false); setBulkText(''); setError(''); }} style={{ fontSize: 13 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="card p-6">
          <div className="skeleton" style={{ width: '100%', height: 200 }} />
        </div>
      )}

      {!loading && entries.length === 0 && !showBulk && (
        <div className="card" style={{ padding: 48, textAlign: 'center', background: 'var(--bg-pure-white)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px' }}>
            <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>No FAQ entries yet</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16, maxWidth: 400, margin: '0 auto 16px' }}>
            Add common questions and answers so the AI chatbot can help your guests.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={() => setShowBulk(true)} style={{ fontSize: 13 }}>Bulk Import</button>
            <button className="btn-primary" onClick={() => { resetForm(); setView('add'); }} style={{ fontSize: 13 }}>+ Add First Entry</button>
          </div>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries.map((entry) => (
            <div key={entry.id} className="card" style={{ padding: 20, background: 'var(--bg-pure-white)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                    {entry.question}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
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
                  <button onClick={() => handleDelete(entry.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
