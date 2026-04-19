'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { formatShortDate } from '@/lib/utils/date-format';
import { vendorColorByName } from '@/lib/utils/vendor-color';

interface Fact {
  id: string;
  source_type: string;
  source_ref: string | null;
  vendor_name: string | null;
  topic: string | null;
  summary: string | null;
  decisions: string[] | null;
  open_questions: string[] | null;
  action_items: Array<{ description: string; due_date: string | null; owner_hint: string | null }> | null;
  amounts: Array<{ description: string; usd: number | null }> | null;
  fact_date: string | null;
  extracted_at: string;
  model: string;
}

interface VendorCount {
  vendor_name: string;
  count: number;
}

export default function FactsPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [vendors, setVendors] = useState<VendorCount[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (vendorFilter: string | null, append = false, cursorArg: string | null = null) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);
      try {
        const qs = new URLSearchParams();
        if (vendorFilter) qs.set('vendor', vendorFilter);
        if (cursorArg) qs.set('cursor', cursorArg);
        qs.set('limit', '40');
        const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/facts?${qs.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || 'Failed to load facts');
        const newFacts = (json.data?.facts || []) as Fact[];
        setFacts((prev) => (append ? [...prev, ...newFacts] : newFacts));
        setVendors(json.data?.vendors || []);
        setCursor(json.data?.next_cursor || null);
        setHasMore(!!json.data?.next_cursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [weddingId]
  );

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const totalFacts = facts.length;

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 20 }}>
        <Link
          href={`/dashboard/${weddingId}/todos`}
          style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 10,
          }}
        >
          ← Back to to-dos
        </Link>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 500,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Knowledge base
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            marginTop: 4,
            lineHeight: 1.55,
            maxWidth: 640,
          }}
        >
          Structured facts the AI pulled from your inbox. These feed the chatbot and auto-todo
          suggestions. Each fact links back to the source email so you can trust what&apos;s there.
        </p>
      </div>

      {/* Vendor filter */}
      {vendors.length > 0 && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 14,
            background: 'var(--bg-pure-white)',
            border: '1px solid var(--border-light)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            Filter by vendor
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              onClick={() => setFilter(null)}
              style={chipStyle(filter === null, 'var(--color-gold-dark)')}
            >
              All · {vendors.reduce((acc, v) => acc + v.count, 0)}
            </button>
            {vendors.map((v) => {
              const active = filter === v.vendor_name;
              const isUnassigned = v.vendor_name === '(unassigned)';
              const color = isUnassigned ? '#8A8078' : vendorColorByName(v.vendor_name);
              return (
                <button
                  key={v.vendor_name}
                  type="button"
                  onClick={() =>
                    setFilter(
                      active
                        ? null
                        : isUnassigned
                        ? '(unassigned)'
                        : v.vendor_name
                    )
                  }
                  style={{
                    ...chipStyle(active, color),
                    paddingLeft: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 999,
                      background: active ? '#FDFBF7' : color,
                      display: 'inline-block',
                    }}
                  />
                  {v.vendor_name} · {v.count}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading && (
        <div
          style={{
            padding: 24,
            borderRadius: 16,
            background: 'var(--bg-pure-white)',
            border: '1px solid var(--border-light)',
          }}
        >
          <div className="skeleton" style={{ width: '100%', height: 180, borderRadius: 12 }} />
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            background: 'rgba(196,112,75,0.08)',
            border: '1px solid rgba(196,112,75,0.25)',
            color: 'var(--color-terracotta)',
            fontSize: 13,
            fontFamily: 'var(--font-body)',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && totalFacts === 0 && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            borderRadius: 16,
            background: 'var(--bg-pure-white)',
            border: '1px solid var(--border-light)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
          }}
        >
          No facts extracted yet. Connect Google and run a sync from the to-dos page.
        </div>
      )}

      {!loading && !error && totalFacts > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {facts.map((f) => (
            <FactCard key={f.id} fact={f} />
          ))}
          {hasMore && (
            <button
              onClick={() => load(filter, true, cursor)}
              disabled={loadingMore}
              style={{
                alignSelf: 'center',
                padding: '8px 18px',
                borderRadius: 10,
                border: '1px solid var(--border-light)',
                background: 'var(--bg-pure-white)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                fontFamily: 'var(--font-body)',
                cursor: loadingMore ? 'default' : 'pointer',
                marginTop: 8,
              }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FactCard({ fact }: { fact: Fact }) {
  const vendorLabel = fact.vendor_name ?? '(general)';
  const color = fact.vendor_name ? vendorColorByName(fact.vendor_name) : '#8A8078';
  const decisions = fact.decisions ?? [];
  const questions = fact.open_questions ?? [];
  const actions = fact.action_items ?? [];
  const amounts = fact.amounts ?? [];
  const isEmpty =
    !fact.summary &&
    decisions.length === 0 &&
    questions.length === 0 &&
    actions.length === 0 &&
    amounts.length === 0;

  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 14,
        background: 'var(--bg-pure-white)',
        border: '1px solid var(--border-light)',
        borderLeft: `4px solid ${color}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px 2px 6px',
              borderRadius: 999,
              background: color + '18',
              color,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: color,
                display: 'inline-block',
              }}
            />
            {vendorLabel}
          </span>
          {fact.topic && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-body)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: 600,
              }}
            >
              {fact.topic}
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {fact.fact_date && <span>{formatShortDate(fact.fact_date, { includeYear: true })}</span>}
          {fact.source_ref && fact.source_type === 'email' && (
            <a
              href={`https://mail.google.com/mail/u/0/#inbox/${fact.source_ref}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--color-gold-dark)', textDecoration: 'none' }}
            >
              open thread →
            </a>
          )}
        </div>
      </div>

      {fact.summary && (
        <p
          style={{
            fontSize: 14,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.5,
            margin: '8px 0 0',
          }}
        >
          {fact.summary}
        </p>
      )}

      {decisions.length > 0 && (
        <FactSection label="Decisions" items={decisions} tone="olive" />
      )}
      {questions.length > 0 && (
        <FactSection label="Open questions" items={questions} tone="terracotta" />
      )}
      {actions.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <SectionHeading label="Action items" />
          <ul
            style={{
              margin: '4px 0 0',
              paddingLeft: 18,
              fontSize: 13,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              lineHeight: 1.55,
            }}
          >
            {actions.map((a, i) => (
              <li key={i}>
                {a.description}
                {a.due_date && (
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    {' '}· due {formatShortDate(a.due_date, { includeYear: false })}
                  </span>
                )}
                {a.owner_hint && (
                  <span style={{ color: 'var(--text-tertiary)' }}> · {a.owner_hint}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {amounts.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <SectionHeading label="Amounts" />
          <ul
            style={{
              margin: '4px 0 0',
              paddingLeft: 18,
              fontSize: 13,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              lineHeight: 1.55,
            }}
          >
            {amounts.map((a, i) => (
              <li key={i}>
                {a.description}
                {a.usd != null && (
                  <span style={{ color: 'var(--color-gold-dark)', fontWeight: 600 }}>
                    {' '}· ${a.usd.toLocaleString('en-US')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isEmpty && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            fontStyle: 'italic',
            margin: '8px 0 0',
          }}
        >
          Thread had no planning signal — indexed for traceability only.
        </p>
      )}
    </div>
  );
}

function FactSection({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: 'olive' | 'terracotta';
}) {
  const toneColor = tone === 'olive' ? 'var(--color-olive)' : 'var(--color-terracotta)';
  return (
    <div style={{ marginTop: 10 }}>
      <SectionHeading label={label} color={toneColor} />
      <ul
        style={{
          margin: '4px 0 0',
          paddingLeft: 18,
          fontSize: 13,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
          lineHeight: 1.55,
        }}
      >
        {items.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    </div>
  );
}

function SectionHeading({ label, color }: { label: string; color?: string }) {
  return (
    <div
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        color: color ?? 'var(--text-tertiary)',
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

function chipStyle(active: boolean, color: string): React.CSSProperties {
  return {
    padding: '5px 11px',
    borderRadius: 999,
    border: active ? 'none' : '1px solid var(--border-light)',
    background: active ? color : 'var(--bg-pure-white)',
    color: active ? '#FDFBF7' : 'var(--text-primary)',
    fontSize: 12,
    fontFamily: 'var(--font-body)',
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s',
  };
}
