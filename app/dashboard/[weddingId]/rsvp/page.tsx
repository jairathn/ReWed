'use client';

import { useState, useEffect, useCallback, use } from 'react';

interface LoadedConfig {
  rsvp_url: string;
  rsvp_passcode: string;
  invite_url: string;
}

const EMPTY: LoadedConfig = { rsvp_url: '', rsvp_passcode: '', invite_url: '' };

export default function RsvpLinkPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const [values, setValues] = useState<LoadedConfig>(EMPTY);
  const [initial, setInitial] = useState<LoadedConfig>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/overview`);
      const data = await res.json();
      const cfg = (data?.wedding?.config ?? {}) as Record<string, unknown>;
      const next: LoadedConfig = {
        rsvp_url: typeof cfg.rsvp_url === 'string' ? cfg.rsvp_url : '',
        rsvp_passcode: typeof cfg.rsvp_passcode === 'string' ? cfg.rsvp_passcode : '',
        invite_url: typeof cfg.invite_url === 'string' ? cfg.invite_url : '',
      };
      setValues(next);
      setInitial(next);
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
      const rsvp = values.rsvp_url.trim();
      const invite = values.invite_url.trim();
      if (rsvp && !/^https?:\/\//i.test(rsvp)) {
        setError('RSVP URL must start with http:// or https://');
        setSaving(false);
        return;
      }
      if (invite && !/^https?:\/\//i.test(invite)) {
        setError('Invite URL must start with http:// or https://');
        setSaving(false);
        return;
      }
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rsvp_url: rsvp || null,
          // Passcode without an RSVP URL is nonsense — drop it on the server
          // side rather than error, but keep what the user typed locally.
          rsvp_passcode: values.rsvp_passcode.trim() || null,
          invite_url: invite || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message || 'Save failed');
      const saved: LoadedConfig = {
        rsvp_url: rsvp,
        rsvp_passcode: values.rsvp_passcode.trim(),
        invite_url: invite,
      };
      setInitial(saved);
      setValues(saved);
      setSavedAt(new Date());
      setTimeout(() => setSavedAt(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    values.rsvp_url.trim() !== initial.rsvp_url.trim() ||
    values.rsvp_passcode.trim() !== initial.rsvp_passcode.trim() ||
    values.invite_url.trim() !== initial.invite_url.trim();

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
          RSVP &amp; Invite
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
            marginTop: 4,
            lineHeight: 1.55,
            maxWidth: 580,
          }}
        >
          Guests see up to two buttons on the home page — one to RSVP (usually your Zola or
          Joy site) and one to view the invite (Canva, PDF, etc.). Leave either blank to hide
          that button.
        </p>
      </div>

      <div
        style={{
          padding: 20,
          borderRadius: 16,
          background: 'var(--bg-pure-white)',
          border: '1px solid var(--border-light)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          marginBottom: 14,
        }}
      >
        {loading ? (
          <div className="skeleton" style={{ width: '100%', height: 180, borderRadius: 10 }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* RSVP URL */}
            <Field
              label="RSVP URL"
              hint="Where guests go to RSVP — typically your Zola / Joy / Knot site."
              placeholder="https://withjoy.com/shriya-and-neil"
              type="url"
              value={values.rsvp_url}
              onChange={(v) => setValues({ ...values, rsvp_url: v })}
            />

            {/* RSVP passcode */}
            <Field
              label="RSVP passcode (optional)"
              hint="If your wedding site has a passcode, paste it here. We'll copy it to the guest's clipboard when they tap RSVP so they can just paste on the other side."
              placeholder="e.g. love2026"
              type="text"
              value={values.rsvp_passcode}
              onChange={(v) => setValues({ ...values, rsvp_passcode: v })}
              disabled={!values.rsvp_url.trim()}
              disabledMessage="Add an RSVP URL first."
            />

            {/* Invite URL */}
            <Field
              label="Invite URL"
              hint="Link to the invite itself — Canva, Paperless Post, a Drive PDF, anything."
              placeholder="https://www.canva.com/design/..."
              type="url"
              value={values.invite_url}
              onChange={(v) => setValues({ ...values, invite_url: v })}
            />

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
              {savedAt && (
                <span style={{ fontSize: 12, color: 'var(--color-olive)', fontFamily: 'var(--font-body)' }}>
                  Saved ✓
                </span>
              )}
              {error && (
                <span style={{ fontSize: 12, color: 'var(--color-terracotta)', fontFamily: 'var(--font-body)' }}>
                  {error}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Preview of what guests actually see */}
      {!loading && (initial.rsvp_url || initial.invite_url) && (
        <div
          style={{
            padding: 16,
            borderRadius: 14,
            background: 'var(--bg-soft-cream)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-body)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-tertiary)',
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            What guests see
          </div>
          {initial.rsvp_url && (
            <div style={{ marginBottom: 6 }}>
              <strong style={{ color: 'var(--text-primary)' }}>RSVP</strong> →{' '}
              <a
                href={initial.rsvp_url}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--color-gold-dark)', wordBreak: 'break-all' }}
              >
                {initial.rsvp_url}
              </a>
              {initial.rsvp_passcode && (
                <>
                  {' '}— passcode{' '}
                  <code
                    style={{
                      background: 'var(--bg-pure-white)',
                      padding: '1px 6px',
                      borderRadius: 4,
                      border: '1px solid var(--border-light)',
                      fontSize: 11,
                    }}
                  >
                    {initial.rsvp_passcode}
                  </code>{' '}
                  copied on tap
                </>
              )}
            </div>
          )}
          {initial.invite_url && (
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>Invite</strong> →{' '}
              <a
                href={initial.invite_url}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--color-gold-dark)', wordBreak: 'break-all' }}
              >
                {initial.invite_url}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  placeholder,
  type,
  value,
  onChange,
  disabled,
  disabledMessage,
}: {
  label: string;
  hint: string;
  placeholder: string;
  type: 'url' | 'text';
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  disabledMessage?: string;
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--text-tertiary)',
          marginBottom: 4,
          fontFamily: 'var(--font-body)',
          fontWeight: 600,
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid var(--border-light)',
          background: disabled ? 'var(--bg-soft-cream)' : 'var(--bg-pure-white)',
          fontSize: 14,
          fontFamily: 'var(--font-body)',
          color: 'var(--text-primary)',
          outline: 'none',
          boxSizing: 'border-box',
          opacity: disabled ? 0.7 : 1,
        }}
      />
      <p
        style={{
          fontSize: 11,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-body)',
          margin: '4px 0 0',
          lineHeight: 1.5,
        }}
      >
        {disabled && disabledMessage ? disabledMessage : hint}
      </p>
    </div>
  );
}
