'use client';

import { useState, useEffect, use, useCallback } from 'react';

interface Vendor {
  id: string;
  name: string;
  company: string | null;
  category: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: boolean;
  deposit_status: string | null;
  notes: string | null;
  access_token: string;
  entry_count: number;
}

interface Wedding {
  slug: string;
}

interface Planner {
  id: string;
  name: string | null;
  email: string;
  access_token: string;
  created_at: string;
  revoked_at: string | null;
}

const DEFAULT_NOTIFICATION_EMAIL = 'shriyaneilwedding@gmail.com';

export default function VendorsPage({
  params,
}: {
  params: Promise<{ weddingId: string }>;
}) {
  const { weddingId } = use(params);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [wedding, setWedding] = useState<Wedding | null>(null);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationSaved, setNotificationSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Vendor> & { id?: string } | null>(null);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [planners, setPlanners] = useState<Planner[]>([]);
  const [plannerForm, setPlannerForm] = useState({ name: '', email: '' });
  const [plannerSaving, setPlannerSaving] = useState(false);
  const [plannerLastLink, setPlannerLastLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, wRes, sRes, pRes] = await Promise.all([
        fetch(`/api/v1/dashboard/weddings/${weddingId}/vendors`),
        fetch(`/api/v1/dashboard/weddings/${weddingId}/overview`),
        fetch(`/api/v1/dashboard/weddings/${weddingId}/vendor-settings`),
        fetch(`/api/v1/dashboard/weddings/${weddingId}/planners`),
      ]);
      const vData = await vRes.json();
      const wData = await wRes.json();
      const sData = await sRes.json();
      setVendors(vData.data?.vendors || []);
      if (wData.wedding) setWedding(wData.wedding);
      setNotificationEmail(
        sData.data?.vendor_notification_email || DEFAULT_NOTIFICATION_EMAIL
      );
      // /planners is couple-only — planners can't manage other planners.
      if (pRes.ok) {
        const pData = await pRes.json();
        setPlanners(pData.data?.planners || []);
      }
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [weddingId]);

  useEffect(() => { load(); }, [load]);

  const saveNotificationEmail = async () => {
    setNotificationSaving(true);
    setNotificationSaved(false);
    try {
      await fetch(`/api/v1/dashboard/weddings/${weddingId}/vendor-settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_notification_email: notificationEmail }),
      });
      setNotificationSaved(true);
      setTimeout(() => setNotificationSaved(false), 2000);
    } finally {
      setNotificationSaving(false);
    }
  };

  const saveVendor = async () => {
    if (!editing) return;
    const body = {
      name: editing.name,
      company: editing.company ?? null,
      category: editing.category ?? null,
      email: editing.email ?? '',
      phone: editing.phone ?? '',
      whatsapp: editing.whatsapp ?? false,
      notes: editing.notes ?? null,
    };
    const url = editing.id
      ? `/api/v1/dashboard/weddings/${weddingId}/vendors/${editing.id}`
      : `/api/v1/dashboard/weddings/${weddingId}/vendors`;
    const res = await fetch(url, {
      method: editing.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.error?.message || 'Save failed');
      return;
    }
    setEditing(null);
    setError('');
    await load();
  };

  const deleteVendor = async (id: string) => {
    if (!confirm('Delete this vendor? Their timeline links will be removed.')) return;
    await fetch(`/api/v1/dashboard/weddings/${weddingId}/vendors/${id}`, {
      method: 'DELETE',
    });
    await load();
  };

  const rotateToken = async (id: string) => {
    if (!confirm('Rotate this vendor\'s link? Their current URL will stop working.')) return;
    await fetch(`/api/v1/dashboard/weddings/${weddingId}/vendors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotate_access_token: true }),
    });
    await load();
  };

  const vendorUrl = (token: string) => {
    if (!wedding?.slug) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/v/${wedding.slug}/${token}`;
  };

  const plannerUrl = (token: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/planner/${token}`;
  };

  const grantPlanner = async () => {
    if (!plannerForm.email.trim()) return;
    setPlannerSaving(true);
    setPlannerLastLink(null);
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/planners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: plannerForm.email.trim(),
          name: plannerForm.name.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Failed to grant');
      setPlannerForm({ name: '', email: '' });
      setPlannerLastLink(data.data?.magic_link || null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to grant');
    } finally {
      setPlannerSaving(false);
    }
  };

  const revokePlanner = async (id: string) => {
    if (!confirm('Revoke this planner\'s access?')) return;
    await fetch(`/api/v1/dashboard/weddings/${weddingId}/planners/${id}`, {
      method: 'DELETE',
    });
    await load();
  };

  const copyLink = async (vendor: Vendor) => {
    const url = vendorUrl(vendor.access_token);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(vendor.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Fallback: select the URL in an input
    }
  };

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 220, height: 32, marginBottom: 16, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: '100%', height: 120, borderRadius: 16, marginBottom: 16 }} />
        <div className="skeleton" style={{ width: '100%', height: 300, borderRadius: 16 }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={headingStyle}>Vendors</h1>
          <p style={subtitleStyle}>
            Each vendor gets a personalized link to their timeline, contact info, and a FAQbot scoped to their work.
          </p>
        </div>
        <button onClick={() => setEditing({})} style={primaryButtonStyle(false)}>
          + Add vendor
        </button>
      </div>

      {/* Notification email card */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={iconWrap('rgba(196,112,75,0.08)')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h3 style={cardLabelStyle}>Where to email vendor-proposed changes</h3>
        </div>
        <p style={{ ...subtitleStyle, marginTop: 0, marginBottom: 12 }}>
          When a vendor comments or proposes a change, we email that address with the subject line prefixed <code>From [Vendor name]</code>.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="email"
            value={notificationEmail}
            onChange={(e) => setNotificationEmail(e.target.value)}
            placeholder={DEFAULT_NOTIFICATION_EMAIL}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={saveNotificationEmail}
            disabled={notificationSaving}
            style={primaryButtonStyle(notificationSaving)}
          >
            {notificationSaving ? 'Saving…' : notificationSaved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </div>

      {/* Planners card */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={iconWrap('rgba(122,139,92,0.08)')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-olive)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <h3 style={cardLabelStyle}>Wedding planner access</h3>
        </div>
        <p style={{ ...subtitleStyle, marginTop: 0, marginBottom: 12 }}>
          Grant edit access on the master timeline and vendors. They&apos;ll get a magic link by email — no password needed. Revoke anytime.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', gap: 8, marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Name (optional)"
            value={plannerForm.name}
            onChange={(e) => setPlannerForm({ ...plannerForm, name: e.target.value })}
            style={inputStyle}
          />
          <input
            type="email"
            placeholder="planner@email.com"
            value={plannerForm.email}
            onChange={(e) => setPlannerForm({ ...plannerForm, email: e.target.value })}
            style={inputStyle}
          />
          <button
            onClick={grantPlanner}
            disabled={plannerSaving || !plannerForm.email.trim()}
            style={primaryButtonStyle(plannerSaving || !plannerForm.email.trim())}
          >
            {plannerSaving ? 'Sending…' : 'Grant access'}
          </button>
        </div>
        {plannerLastLink && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', margin: '0 0 12px' }}>
            Magic link sent. Or share directly:{' '}
            <code
              style={{
                fontSize: 11,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'var(--bg-soft-cream)',
              }}
            >
              {plannerLastLink}
            </code>
          </p>
        )}
        {planners.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 12 }}>
            {planners.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border-light)',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                    {p.name || p.email}
                    {p.revoked_at && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-terracotta)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Revoked
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}>
                    {p.email}
                    {!p.revoked_at && (
                      <>
                        {' · '}
                        <a
                          href={plannerUrl(p.access_token)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--color-gold-dark)', textDecoration: 'none' }}
                        >
                          magic link
                        </a>
                      </>
                    )}
                  </div>
                </div>
                {!p.revoked_at && (
                  <button
                    onClick={() => revokePlanner(p.id)}
                    style={{ ...secondaryButtonStyle, padding: '6px 10px', fontSize: 11, color: 'var(--color-terracotta)' }}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vendor list */}
      {vendors.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>
          No vendors yet. Upload your spreadsheet from the Timeline page, or add one manually.
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          {vendors.map((v, idx) => (
            <div
              key={v.id}
              style={{
                padding: 18,
                borderBottom: idx < vendors.length - 1 ? '1px solid var(--border-light)' : 'none',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 14,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0, color: 'var(--text-primary)', fontWeight: 500 }}>
                    {v.name}
                  </h3>
                  {v.category && (
                    <span style={{ fontSize: 11, color: 'var(--color-gold-dark)', textTransform: 'uppercase', letterSpacing: '0.5px', fontFamily: 'var(--font-body)' }}>
                      {v.category}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                  {v.email && <span>✉ {v.email}</span>}
                  {v.phone && <span>☎ {v.phone}{v.whatsapp && ' · WhatsApp'}</span>}
                  <span>{v.entry_count} timeline {v.entry_count === 1 ? 'entry' : 'entries'}</span>
                </div>
                {wedding?.slug && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 }}>
                    <code
                      style={{
                        fontSize: 11,
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: 'var(--bg-soft-cream)',
                        color: 'var(--text-secondary)',
                        maxWidth: 420,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {vendorUrl(v.access_token)}
                    </code>
                    <button
                      onClick={() => copyLink(v)}
                      style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: 11 }}
                    >
                      {copiedId === v.id ? 'Copied ✓' : 'Copy'}
                    </button>
                    <button
                      onClick={() => rotateToken(v.id)}
                      style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: 11, color: 'var(--color-terracotta)' }}
                    >
                      Rotate
                    </button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <button onClick={() => setEditing(v)} style={secondaryButtonStyle}>
                  Edit
                </button>
                <button
                  onClick={() => deleteVendor(v.id)}
                  style={{ ...secondaryButtonStyle, color: 'var(--color-terracotta)' }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--color-terracotta)', fontFamily: 'var(--font-body)' }}>
          {error}
        </p>
      )}

      {editing && (
        <VendorModal
          vendor={editing}
          onChange={setEditing}
          onSave={saveVendor}
          onCancel={() => { setEditing(null); setError(''); }}
        />
      )}
    </div>
  );
}

function VendorModal({
  vendor,
  onChange,
  onSave,
  onCancel,
}: {
  vendor: Partial<Vendor> & { id?: string };
  onChange: (v: Partial<Vendor> & { id?: string }) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(12, 10, 9, 0.4)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--bg-pure-white)',
          borderRadius: 16,
          padding: 24,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: '0 0 16px', color: 'var(--text-primary)' }}>
          {vendor.id ? 'Edit vendor' : 'New vendor'}
        </h2>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Name *</label>
          <input
            type="text"
            value={vendor.name || ''}
            onChange={(e) => onChange({ ...vendor, name: e.target.value })}
            placeholder="Jas Johal"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Category</label>
            <input
              type="text"
              value={vendor.category || ''}
              onChange={(e) => onChange({ ...vendor, category: e.target.value })}
              placeholder="DJ / MC"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Company</label>
            <input
              type="text"
              value={vendor.company || ''}
              onChange={(e) => onChange({ ...vendor, company: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={vendor.email || ''}
            onChange={(e) => onChange({ ...vendor, email: e.target.value })}
            placeholder="jas@example.com"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Phone (include country code)</label>
          <input
            type="tel"
            value={vendor.phone || ''}
            onChange={(e) => onChange({ ...vendor, phone: e.target.value })}
            placeholder="+34 622 48 92 76"
            style={inputStyle}
          />
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '4px 0 0', fontFamily: 'var(--font-body)' }}>
            Use international format so tap-to-call works for guests and vendors abroad.
          </p>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--text-primary)', marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={!!vendor.whatsapp}
            onChange={(e) => onChange({ ...vendor, whatsapp: e.target.checked })}
          />
          Reachable on WhatsApp
        </label>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            rows={3}
            value={vendor.notes || ''}
            onChange={(e) => onChange({ ...vendor, notes: e.target.value })}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onCancel} style={secondaryButtonStyle}>
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!vendor.name?.trim()}
            style={primaryButtonStyle(!vendor.name?.trim())}
          >
            Save
          </button>
        </div>
      </div>
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
};

const cardStyle: React.CSSProperties = {
  padding: 20,
  borderRadius: 16,
  background: 'var(--bg-pure-white)',
  border: '1px solid var(--border-light)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
  marginBottom: 20,
};

const cardLabelStyle: React.CSSProperties = {
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--text-tertiary)',
  margin: 0,
  fontFamily: 'var(--font-body)',
};

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

function iconWrap(bg: string): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
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

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid var(--border-light)',
  background: 'var(--bg-pure-white)',
  color: 'var(--text-secondary)',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'var(--font-body)',
  cursor: 'pointer',
};
