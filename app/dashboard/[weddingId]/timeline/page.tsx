'use client';

import { useState, useEffect, useRef, use, useCallback } from 'react';

interface Vendor {
  id: string;
  name: string;
  category: string | null;
}

interface TimelineEntry {
  id: string;
  event_date: string | null;
  event_name: string | null;
  time_label: string | null;
  sort_order: number;
  action: string;
  location: string | null;
  notes: string | null;
  status: string | null;
  deadline: boolean;
  vendors: Array<{ id: string; name: string; role: string }>;
}

interface DraftEntry {
  id?: string;
  event_date: string;
  event_name: string;
  time_label: string;
  action: string;
  location: string;
  notes: string;
  status: string;
  deadline: boolean;
  vendor_ids: string[];
}

export default function TimelinePage({
  params,
}: {
  params: Promise<{ weddingId: string }>;
}) {
  const { weddingId } = use(params);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    vendors_synced: number;
    entries_synced: number;
    unmatched_vendor_references: string[];
  } | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<DraftEntry | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, vRes] = await Promise.all([
        fetch(`/api/v1/dashboard/weddings/${weddingId}/timeline`),
        fetch(`/api/v1/dashboard/weddings/${weddingId}/vendors`),
      ]);
      const eData = await eRes.json();
      const vData = await vRes.json();
      setEntries(eData.data?.entries || []);
      setVendors(vData.data?.vendors || []);
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [weddingId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError('');
    setUploadResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(
        `/api/v1/dashboard/weddings/${weddingId}/timeline/upload`,
        { method: 'POST', body: form }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Upload failed');
      setUploadResult(data.data);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openNewEntry = (event_date: string, event_name: string) => {
    setEditing({
      event_date,
      event_name,
      time_label: '',
      action: '',
      location: '',
      notes: '',
      status: '',
      deadline: false,
      vendor_ids: [],
    });
  };

  const openEdit = (entry: TimelineEntry) => {
    setEditing({
      id: entry.id,
      event_date: entry.event_date || '',
      event_name: entry.event_name || '',
      time_label: entry.time_label || '',
      action: entry.action || '',
      location: entry.location || '',
      notes: entry.notes || '',
      status: entry.status || '',
      deadline: entry.deadline,
      vendor_ids: entry.vendors.map((v) => v.id),
    });
  };

  const saveEntry = async () => {
    if (!editing) return;
    const body = {
      event_date: editing.event_date || null,
      event_name: editing.event_name || null,
      time_label: editing.time_label || null,
      action: editing.action,
      location: editing.location || null,
      notes: editing.notes || null,
      status: editing.status || null,
      deadline: editing.deadline,
      vendor_ids: editing.vendor_ids,
    };
    const url = editing.id
      ? `/api/v1/dashboard/weddings/${weddingId}/timeline/${editing.id}`
      : `/api/v1/dashboard/weddings/${weddingId}/timeline`;
    const method = editing.id ? 'PATCH' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.error?.message || 'Save failed');
      return;
    }
    setEditing(null);
    await load();
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    const res = await fetch(
      `/api/v1/dashboard/weddings/${weddingId}/timeline/${id}`,
      { method: 'DELETE' }
    );
    if (!res.ok) {
      setError('Delete failed');
      return;
    }
    await load();
  };

  // Group entries by (event_date, event_name)
  const groups = new Map<string, { date: string; name: string; entries: TimelineEntry[] }>();
  for (const e of entries) {
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

  if (loading) {
    return (
      <div>
        <div className="skeleton" style={{ width: 220, height: 32, marginBottom: 16, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 16, marginBottom: 16 }} />
        <div className="skeleton" style={{ width: '100%', height: 400, borderRadius: 16 }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={headingStyle}>Master Timeline</h1>
        <p style={subtitleStyle}>
          Upload your planning spreadsheet, then edit entries directly. Each entry can be assigned to one or more vendors — they&apos;ll see only their assigned items on their vendor page.
        </p>
      </div>

      {/* Upload card */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={iconWrap('rgba(198,163,85,0.08)')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h3 style={cardLabelStyle}>Import from Excel</h3>
        </div>
        <p style={{ ...subtitleStyle, marginTop: 0, marginBottom: 14 }}>
          Expects a workbook with <code>Basic Info - Venues &amp; Vendors</code> and <code>Master Timeline</code> sheets. Vendor access tokens are preserved across re-uploads.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={primaryButtonStyle(uploading)}
          >
            {uploading ? 'Parsing...' : 'Choose .xlsx file'}
          </button>
          <a
            href={`/api/v1/dashboard/weddings/${weddingId}/timeline/export`}
            style={{ ...secondaryButtonStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            Download current as .xlsx
          </a>
        </div>
        {uploadResult && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 10,
              background: 'rgba(122,139,92,0.06)',
              border: '1px solid rgba(122,139,92,0.2)',
              fontSize: 13,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
            }}
          >
            Synced <strong>{uploadResult.vendors_synced}</strong> vendors and{' '}
            <strong>{uploadResult.entries_synced}</strong> timeline entries.
            {uploadResult.unmatched_vendor_references.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                Could not match these vendor references in the timeline:{' '}
                <em>{uploadResult.unmatched_vendor_references.join(', ')}</em>
              </div>
            )}
          </div>
        )}
        {error && (
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--color-terracotta)', fontFamily: 'var(--font-body)' }}>
            {error}
          </p>
        )}
      </div>

      {/* Timeline groups */}
      {groupList.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>
          No timeline entries yet. Upload your spreadsheet to get started.
        </div>
      ) : (
        groupList.map((g) => (
          <div key={`${g.date}__${g.name}`} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <h3 style={{ ...cardLabelStyle, fontSize: 13, color: 'var(--color-gold-dark)' }}>
                  {g.date && formatDate(g.date)}
                </h3>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, margin: '2px 0 0', color: 'var(--text-primary)' }}>
                  {g.name}
                </h2>
              </div>
              <button
                onClick={() => openNewEntry(g.date, g.name)}
                style={secondaryButtonStyle}
              >
                + Add entry
              </button>
            </div>
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              {g.entries.map((e, idx) => (
                <div
                  key={e.id}
                  onClick={() => openEdit(e)}
                  style={{
                    padding: '14px 18px',
                    borderBottom: idx < g.entries.length - 1 ? '1px solid var(--border-light)' : 'none',
                    cursor: 'pointer',
                    display: 'grid',
                    gridTemplateColumns: '90px 1fr auto',
                    gap: 14,
                    alignItems: 'center',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--bg-soft-cream)')}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      color: 'var(--text-secondary)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {e.time_label || '—'}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', lineHeight: 1.45 }}>
                      {e.action}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                      {e.location && (
                        <span style={chipStyle}>{e.location}</span>
                      )}
                      {e.vendors.map((v) => (
                        <span key={v.id} style={{ ...chipStyle, background: 'rgba(198,163,85,0.08)', color: 'var(--color-gold-dark)' }}>
                          {v.name}
                        </span>
                      ))}
                      {e.deadline && (
                        <span style={{ ...chipStyle, background: 'rgba(196,112,75,0.1)', color: 'var(--color-terracotta)' }}>
                          Deadline
                        </span>
                      )}
                      {e.status && !e.deadline && /to\s*do/i.test(e.status) && (
                        <span style={{ ...chipStyle, background: 'rgba(255,180,60,0.12)', color: '#9B6B1F' }}>
                          To do
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); deleteEntry(e.id); }}
                    style={iconButtonStyle}
                    aria-label="Delete entry"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Edit modal */}
      {editing && (
        <EditEntryModal
          entry={editing}
          vendors={vendors}
          onChange={setEditing}
          onSave={saveEntry}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EditEntryModal({
  entry,
  vendors,
  onChange,
  onSave,
  onCancel,
}: {
  entry: DraftEntry;
  vendors: Vendor[];
  onChange: (e: DraftEntry) => void;
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
          maxWidth: 560,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: '0 0 16px', color: 'var(--text-primary)' }}>
          {entry.id ? 'Edit entry' : 'New entry'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              value={entry.event_date}
              onChange={(e) => onChange({ ...entry, event_date: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Event</label>
            <input
              type="text"
              placeholder="Haldi, Sangeet, Wedding…"
              value={entry.event_name}
              onChange={(e) => onChange({ ...entry, event_name: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Time</label>
            <input
              type="text"
              placeholder="10:00 AM"
              value={entry.time_label}
              onChange={(e) => onChange({ ...entry, time_label: e.target.value })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Location</label>
            <input
              type="text"
              value={entry.location}
              onChange={(e) => onChange({ ...entry, location: e.target.value })}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Action</label>
          <textarea
            rows={2}
            value={entry.action}
            onChange={(e) => onChange({ ...entry, action: e.target.value })}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            rows={3}
            value={entry.notes}
            onChange={(e) => onChange({ ...entry, notes: e.target.value })}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginBottom: 12, alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Status</label>
            <input
              type="text"
              placeholder="TO DO, DEADLINE, etc."
              value={entry.status}
              onChange={(e) => onChange({ ...entry, status: e.target.value })}
              style={inputStyle}
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--text-primary)', paddingBottom: 12 }}>
            <input
              type="checkbox"
              checked={entry.deadline}
              onChange={(e) => onChange({ ...entry, deadline: e.target.checked })}
            />
            Hard deadline
          </label>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Assigned vendors</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {vendors.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', margin: 0 }}>
                No vendors yet. Add them from the Vendors page or upload the spreadsheet.
              </p>
            ) : (
              vendors.map((v) => {
                const selected = entry.vendor_ids.includes(v.id);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      const next = selected
                        ? entry.vendor_ids.filter((id) => id !== v.id)
                        : [...entry.vendor_ids, v.id];
                      onChange({ ...entry, vendor_ids: next });
                    }}
                    style={{
                      padding: '5px 11px',
                      borderRadius: 20,
                      border: selected ? 'none' : '1px solid var(--border-light)',
                      background: selected
                        ? 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))'
                        : 'var(--bg-pure-white)',
                      color: selected ? '#FDFBF7' : 'var(--text-secondary)',
                      fontSize: 12,
                      fontFamily: 'var(--font-body)',
                      cursor: 'pointer',
                    }}
                  >
                    {v.name}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onCancel} style={secondaryButtonStyle}>
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!entry.action.trim()}
            style={primaryButtonStyle(!entry.action.trim())}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
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

const chipStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 20,
  background: 'var(--bg-soft-cream)',
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-body)',
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

const iconButtonStyle: React.CSSProperties = {
  padding: 6,
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-tertiary)',
  cursor: 'pointer',
};
