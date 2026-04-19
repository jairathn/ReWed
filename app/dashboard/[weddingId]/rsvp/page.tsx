'use client';

import { useState, useEffect, useCallback, use } from 'react';

export default function RsvpLinkPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const [rsvpUrl, setRsvpUrl] = useState('');
  const [initialUrl, setInitialUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Reuse the overview endpoint — it already returns the wedding row
      // including config. No need for a dedicated GET for a single field.
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/overview`);
      const data = await res.json();
      const current =
        (data?.wedding?.config?.rsvp_url as string | null | undefined) ?? '';
      setRsvpUrl(current || '');
      setInitialUrl(current || '');
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [weddingId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError('');
    setSavedAt(null);
    try {
      const trimmed = rsvpUrl.trim();
      // Surface the obvious error before hitting the server.
      if (trimmed && !/^https?:\/\//i.test(trimmed)) {
        setError('URL must start with http:// or https://');
        setSaving(false);
        return;
      }
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsvp_url: trimmed || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error?.message || 'Save failed');
      }
      setInitialUrl(trimmed);
      setSavedAt(new Date());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    setRsvpUrl('');
  };

  const dirty = rsvpUrl.trim() !== initialUrl.trim();

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 20 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 500,
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          RSVP link
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            marginTop: 4,
            lineHeight: 1.55,
            maxWidth: 560,
          }}
        >
          Guests see an <strong>RSVP</strong> button in the header of the guest app that sends
          them to this URL — typically your Zola or The Knot wedding site. Leave blank to hide
          the button.
        </p>
      </div>

      <div
        style={{
          padding: 20,
          borderRadius: 16,
          background: 'var(--bg-pure-white)',
          border: '1px solid var(--border-light)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
        }}
      >
        {loading ? (
          <div className="skeleton" style={{ width: '100%', height: 48, borderRadius: 10 }} />
        ) : (
          <>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--text-tertiary)',
                marginBottom: 6,
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
              }}
            >
              External RSVP URL
            </label>
            <input
              type="url"
              value={rsvpUrl}
              onChange={(e) => setRsvpUrl(e.target.value)}
              placeholder="https://withjoy.com/shriya-and-neil"
              style={{
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
              }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={save}
                disabled={saving || !dirty}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background:
                    saving || !dirty
                      ? 'var(--border-light)'
                      : 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
                  color: saving || !dirty ? 'var(--text-tertiary)' : '#FDFBF7',
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: 'var(--font-body)',
                  cursor: saving || !dirty ? 'default' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {rsvpUrl && (
                <button
                  onClick={clear}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-pure-white)',
                    color: 'var(--color-terracotta)',
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: 'var(--font-body)',
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              )}
              {savedAt && (
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--color-olive)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Saved ✓
                </span>
              )}
              {error && (
                <span
                  style={{
                    fontSize: 12,
                    color: 'var(--color-terracotta)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {error}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {initialUrl && (
        <div
          style={{
            marginTop: 14,
            padding: '10px 14px',
            borderRadius: 12,
            background: 'var(--bg-soft-cream)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
          }}
        >
          Currently sending guests to{' '}
          <a
            href={initialUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              color: 'var(--color-gold-dark)',
              fontWeight: 500,
              wordBreak: 'break-all',
            }}
          >
            {initialUrl}
          </a>
        </div>
      )}
    </div>
  );
}
