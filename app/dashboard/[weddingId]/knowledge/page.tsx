'use client';

import { useState, useEffect, use } from 'react';

interface KnowledgeData {
  knowledge_base: string;
  wedding_planner: {
    name: string;
    email: string;
  };
}

export default function KnowledgePage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const [data, setData] = useState<KnowledgeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');

  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [plannerName, setPlannerName] = useState('');
  const [plannerEmail, setPlannerEmail] = useState('');

  useEffect(() => {
    fetch(`/api/v1/dashboard/weddings/${weddingId}/knowledge`)
      .then((res) => res.json())
      .then((d: KnowledgeData) => {
        setData(d);
        setKnowledgeBase(d.knowledge_base || '');
        setPlannerName(d.wedding_planner?.name || '');
        setPlannerEmail(d.wedding_planner?.email || '');
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [weddingId]);

  const dirty =
    !!data &&
    (knowledgeBase !== data.knowledge_base ||
      plannerName !== data.wedding_planner.name ||
      plannerEmail !== data.wedding_planner.email);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/knowledge`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledge_base: knowledgeBase,
          wedding_planner_name: plannerName,
          wedding_planner_email: plannerEmail,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || 'Failed to save');
      }
      const updated: KnowledgeData = await res.json();
      setData(updated);
      setKnowledgeBase(updated.knowledge_base || '');
      setPlannerName(updated.wedding_planner?.name || '');
      setPlannerEmail(updated.wedding_planner?.email || '');
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 220, height: 32, marginBottom: 16, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: '100%', height: 400, borderRadius: 16 }} />
      </div>
    );
  }

  const charCount = knowledgeBase.length;
  const charMax = 50000;

  return (
    <div style={{ maxWidth: 820 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
          Knowledge Base
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>
          Extra info the FAQ chatbot can use to answer guest questions, plus your wedding planner contact.
        </p>
      </div>

      {/* Wedding Planner Card */}
      <div
        style={{
          padding: 24,
          borderRadius: 16,
          background: 'var(--bg-pure-white)',
          border: '1px solid var(--border-light)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'rgba(122,139,92,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-olive)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h3
            style={{
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-tertiary)',
              margin: 0,
              fontFamily: 'var(--font-body)',
            }}
          >
            Wedding Planner
          </h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
          Shown to guests on the FAQ page as a fallback: &ldquo;Didn&apos;t find your answer? Email our wedding planner.&rdquo;
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              value={plannerName}
              onChange={(e) => setPlannerName(e.target.value)}
              placeholder="Evelina Aasberg"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={plannerEmail}
              onChange={(e) => setPlannerEmail(e.target.value)}
              placeholder="evelina@eyaweddings.com"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Knowledge Base Card */}
      <div
        style={{
          padding: 24,
          borderRadius: 16,
          background: 'var(--bg-pure-white)',
          border: '1px solid var(--border-light)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'rgba(198,163,85,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
          </div>
          <h3
            style={{
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-tertiary)',
              margin: 0,
              fontFamily: 'var(--font-body)',
            }}
          >
            Wedding Context
          </h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
          Paste any freeform information here — accommodations, travel tips, registry notes,
          things you&apos;d normally put on a wedding website. The FAQ chatbot will use this to
          answer guest questions alongside your FAQ entries and schedule.
        </p>

        {/* Zola explainer */}
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: 'var(--bg-soft-cream)',
            border: '1px solid var(--border-light)',
            marginBottom: 16,
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flexShrink: 0, marginTop: 2 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
              Importing from Zola (password-protected)
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.55, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
              Zola has no public API and doesn&apos;t allow third-party scraping of password-protected
              pages. The easy workaround: while logged into Zola, open each section
              (Travel, Schedule, FAQ, Things To Do, etc.), select the text with{' '}
              <kbd style={kbdStyle}>⌘A</kbd>, copy with <kbd style={kbdStyle}>⌘C</kbd>, and paste
              it below. The chatbot will handle messy formatting — just include section headers
              so it knows what each block is about.
            </p>
          </div>
        </div>

        <textarea
          value={knowledgeBase}
          onChange={(e) => setKnowledgeBase(e.target.value)}
          rows={20}
          maxLength={charMax}
          placeholder={`Example:

## Accommodations
We have room blocks at the Hotel Villa Cortine (use code JAYWALKING) and Grand Hotel Cadenabbia (code NEIL2026). Both are walking distance from the ceremony venue.

## Travel
The closest airport is Milan Malpensa (MXP). From there it's about a 90-minute drive or train to Lake Como...

## Registry
We've registered at Zola. A link is on our wedding website.

## Dress Code
Formal/black tie optional. Think garden party elegance.`}
          style={{
            ...inputStyle,
            resize: 'vertical',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 13,
            lineHeight: 1.55,
            minHeight: 320,
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, fontFamily: 'var(--font-body)' }}>
            Tip: section headings (like <code>## Travel</code>) help the chatbot find the right info.
          </p>
          <p
            style={{
              fontSize: 11,
              color: charCount > charMax * 0.9 ? 'var(--color-terracotta)' : 'var(--text-tertiary)',
              margin: 0,
              fontFamily: 'var(--font-body)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {charCount.toLocaleString()} / {charMax.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Save bar */}
      <div
        style={{
          position: 'sticky',
          bottom: 16,
          padding: 16,
          borderRadius: 14,
          background: 'var(--bg-pure-white)',
          border: '1px solid var(--border-light)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
          {error ? (
            <span style={{ color: 'var(--color-terracotta)' }}>{error}</span>
          ) : dirty ? (
            'Unsaved changes'
          ) : savedAt ? (
            `Saved ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
          ) : (
            'All changes saved'
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: 'none',
            background: dirty
              ? 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))'
              : 'var(--border-light)',
            color: dirty ? '#FDFBF7' : 'var(--text-tertiary)',
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'var(--font-body)',
            cursor: dirty && !saving ? 'pointer' : 'default',
            boxShadow: dirty ? '0 2px 8px rgba(198,163,85,0.2)' : 'none',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
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

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 6px',
  borderRadius: 4,
  border: '1px solid var(--border-medium)',
  background: 'var(--bg-pure-white)',
  fontSize: 11,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  color: 'var(--text-primary)',
};
