'use client';

import { useState, useEffect, useCallback, use } from 'react';
import PasswordConfirmDialog from '@/components/ui/PasswordConfirmDialog';

interface Guest {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  group_label: string | null;
  rsvp_status: 'pending' | 'attending' | 'declined';
  created_at: string;
}

interface ColumnMapping {
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  suffix: string | null;
  email: string | null;
  phone: string | null;
  group_label: string | null;
  rsvp_status: string | null;
  relationship: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  partner_title: string | null;
  partner_first_name: string | null;
  partner_last_name: string | null;
  partner_suffix: string | null;
  child1_first_name: string | null;
  child1_last_name: string | null;
  child2_first_name: string | null;
  child2_last_name: string | null;
  child3_first_name: string | null;
  child3_last_name: string | null;
  child4_first_name: string | null;
  child4_last_name: string | null;
  child5_first_name: string | null;
  child5_last_name: string | null;
  total_definitely_invited: string | null;
  total_maybe_invited: string | null;
}

type View = 'list' | 'add' | 'import-upload' | 'import-preview' | 'edit';

export default function GuestsPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Add/Edit form
  const [editGuest, setEditGuest] = useState<Guest | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [groupLabel, setGroupLabel] = useState('');
  const [rsvp, setRsvp] = useState<'pending' | 'attending' | 'declined'>('pending');
  const [formLoading, setFormLoading] = useState(false);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  // Delete confirmation (password-gated)
  const [confirmDelete, setConfirmDelete] = useState<
    | { type: 'single'; id: string; name: string }
    | { type: 'batch'; count: number }
    | null
  >(null);

  // CSV Import
  const [csvText, setCsvText] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<ColumnMapping>({
    first_name: null, last_name: null, title: null, suffix: null,
    email: null, phone: null, group_label: null, rsvp_status: null, relationship: null,
    address_line1: null, address_line2: null, city: null, state: null, zip: null, country: null,
    partner_title: null, partner_first_name: null, partner_last_name: null, partner_suffix: null,
    child1_first_name: null, child1_last_name: null,
    child2_first_name: null, child2_last_name: null,
    child3_first_name: null, child3_last_name: null,
    child4_first_name: null, child4_last_name: null,
    child5_first_name: null, child5_last_name: null,
    total_definitely_invited: null, total_maybe_invited: null,
  });
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvTotalRows, setCsvTotalRows] = useState(0);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [estimatedGuests, setEstimatedGuests] = useState(0);

  const fetchGuests = useCallback(async () => {
    try {
      const url = search.length >= 2
        ? `/api/v1/dashboard/weddings/${weddingId}/guests?q=${encodeURIComponent(search)}`
        : `/api/v1/dashboard/weddings/${weddingId}/guests`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setGuests(data.guests || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [weddingId, search]);

  useEffect(() => { fetchGuests(); }, [fetchGuests]);

  const resetForm = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setGroupLabel('');
    setRsvp('pending');
    setEditGuest(null);
    setError('');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/guests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: email || undefined,
          phone: phone || undefined,
          group_label: groupLabel || undefined,
          rsvp_status: rsvp,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message || 'Failed to add guest');
        return;
      }
      resetForm();
      setView('list');
      fetchGuests();
    } catch {
      setError('Network error');
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editGuest) return;
    setFormLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/guests/${editGuest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          phone: phone || null,
          group_label: groupLabel || null,
          rsvp_status: rsvp,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message || 'Failed to update guest');
        return;
      }
      resetForm();
      setView('list');
      fetchGuests();
    } catch {
      setError('Network error');
    } finally {
      setFormLoading(false);
    }
  };

  const performDelete = async (guestId: string) => {
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/guests/${guestId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setGuests((prev) => prev.filter((g) => g.id !== guestId));
      }
    } catch {
      // Silently fail
    } finally {
      setConfirmDelete(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === guests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(guests.map((g) => g.id)));
    }
  };

  const performBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setBatchDeleting(true);
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/guests/batch-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        setGuests((prev) => prev.filter((g) => !selectedIds.has(g.id)));
        setSelectedIds(new Set());
      }
    } catch {
      // Silently fail
    } finally {
      setBatchDeleting(false);
      setConfirmDelete(null);
    }
  };

  const startEdit = (guest: Guest) => {
    setEditGuest(guest);
    setFirstName(guest.first_name);
    setLastName(guest.last_name);
    setEmail(guest.email || '');
    setPhone(guest.phone || '');
    setGroupLabel(guest.group_label || '');
    setRsvp(guest.rsvp_status);
    setView('edit');
  };

  // CSV Import handlers
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
    };
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    setImportLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/guests/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_text: csvText, step: 'preview' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Failed to parse CSV');
        return;
      }
      setCsvHeaders(data.headers);
      setCsvMapping(data.mapping);
      setCsvPreview(data.preview);
      setCsvTotalRows(data.total_rows);
      setEstimatedGuests(data.estimated_guests || data.total_rows);
      setView('import-preview');
    } catch {
      setError('Network error');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImport = async () => {
    setImportLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/guests/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_text: csvText, step: 'import', column_mapping: csvMapping }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Import failed');
        return;
      }
      setImportResult(data);
      fetchGuests();
    } catch {
      setError('Network error');
    } finally {
      setImportLoading(false);
    }
  };

  const updateMapping = (field: keyof ColumnMapping, header: string | null) => {
    setCsvMapping((prev) => ({ ...prev, [field]: header }));
  };

  const rsvpBadge = (status: string) => {
    const colors: Record<string, { bg: string; fg: string }> = {
      attending: { bg: 'rgba(122, 139, 92, 0.12)', fg: 'var(--color-olive)' },
      declined: { bg: 'rgba(196, 112, 75, 0.1)', fg: 'var(--color-terracotta)' },
      pending: { bg: 'rgba(0, 0, 0, 0.05)', fg: 'var(--text-tertiary)' },
    };
    const c = colors[status] || colors.pending;
    return (
      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: c.bg, color: c.fg, fontWeight: 500 }}>
        {status}
      </span>
    );
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
      <div style={{ maxWidth: 520 }}>
        <button
          onClick={() => { resetForm(); setView('list'); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, fontFamily: 'var(--font-body)' }}
        >
          &larr; Back to guest list
        </button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
          {view === 'edit' ? 'Edit Guest' : 'Add Guest'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginBottom: 24 }}>
          {view === 'edit' ? 'Update guest details below.' : 'Fill in the details to add a new guest.'}
        </p>
        <form onSubmit={view === 'edit' ? handleUpdate : handleAdd} style={{ padding: 24, background: 'var(--bg-pure-white)', borderRadius: 16, border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Group / Table</label>
              <input style={inputStyle} value={groupLabel} onChange={(e) => setGroupLabel(e.target.value)} placeholder="e.g., Bride's Family" />
            </div>
            <div>
              <label style={labelStyle}>RSVP Status</label>
              <select style={inputStyle} value={rsvp} onChange={(e) => setRsvp(e.target.value as Guest['rsvp_status'])}>
                <option value="pending">Pending</option>
                <option value="attending">Attending</option>
                <option value="declined">Declined</option>
              </select>
            </div>
          </div>
          {error && <p style={{ color: 'var(--color-terracotta)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" disabled={formLoading} style={{ opacity: formLoading ? 0.7 : 1, background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', border: 'none', cursor: 'pointer', padding: '10px 20px', fontSize: 14, fontFamily: 'var(--font-body)', fontWeight: 500 }}>
              {formLoading ? 'Saving...' : view === 'edit' ? 'Update Guest' : 'Add Guest'}
            </button>
            <button type="button" onClick={() => { resetForm(); setView('list'); }} style={{ border: '1px solid var(--border-light)', borderRadius: 10, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer', padding: '10px 20px', fontSize: 14, fontFamily: 'var(--font-body)', fontWeight: 500 }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ─── CSV Upload ───
  if (view === 'import-upload') {
    return (
      <div style={{ maxWidth: 600 }}>
        <button
          onClick={() => { setCsvText(''); setError(''); setImportResult(null); setView('list'); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, fontFamily: 'var(--font-body)' }}
        >
          &larr; Back to guest list
        </button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
          Import Guests from CSV
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginBottom: 24 }}>
          Upload a CSV exported from Zola, The Knot, or any spreadsheet. We&apos;ll automatically detect the columns.
        </p>

        <div style={{ padding: 24, background: 'var(--bg-pure-white)', borderRadius: 16, border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <div
            style={{
              border: '2px dashed var(--border-medium)',
              borderRadius: 12,
              padding: 32,
              textAlign: 'center',
              marginBottom: 16,
            }}
          >
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              style={{
                cursor: 'pointer',
                display: 'block',
              }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 12px' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, margin: '0 0 4px' }}>
                Click to upload CSV file
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
                Supports Zola, The Knot, and standard CSV formats
              </p>
            </label>
          </div>

          {csvText && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--color-olive)', fontWeight: 500 }}>
                File loaded ({csvText.split('\n').length - 1} rows detected)
              </p>
            </div>
          )}

          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 12px' }}>
            Or paste CSV data directly:
          </p>
          <textarea
            style={{
              ...inputStyle,
              minHeight: 120,
              resize: 'vertical',
            }}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={'First Name,Last Name,Email,Phone,Group\nJohn,Doe,john@example.com,555-1234,Groom\'s Side'}
          />

          {error && <p style={{ color: 'var(--color-terracotta)', fontSize: 13, marginTop: 12 }}>{error}</p>}

          <button
            onClick={handlePreview}
            disabled={!csvText.trim() || importLoading}
            style={{ marginTop: 16, opacity: !csvText.trim() || importLoading ? 0.5 : 1, background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', border: 'none', cursor: 'pointer', padding: '10px 20px', fontSize: 14, fontFamily: 'var(--font-body)', fontWeight: 500 }}
          >
            {importLoading ? 'Analyzing...' : 'Preview Import'}
          </button>
        </div>
      </div>
    );
  }

  // ─── CSV Preview + Mapping ───
  if (view === 'import-preview') {
    if (importResult) {
      return (
        <div style={{ maxWidth: 600 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
            Import Complete
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginBottom: 24 }}>
            Here&apos;s a summary of your import.
          </p>
          <div style={{ padding: 24, background: 'var(--bg-pure-white)', borderRadius: 16, border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div style={{ textAlign: 'center', padding: 16, borderRadius: 12, background: 'rgba(122, 139, 92, 0.08)' }}>
                <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-olive)', margin: 0 }}>{importResult.imported}</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>imported</p>
              </div>
              <div style={{ textAlign: 'center', padding: 16, borderRadius: 12, background: 'rgba(0, 0, 0, 0.04)' }}>
                <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-tertiary)', margin: 0 }}>{importResult.skipped}</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>skipped</p>
              </div>
            </div>
            {importResult.errors.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-terracotta)', marginBottom: 8 }}>Errors:</p>
                {importResult.errors.map((err, i) => (
                  <p key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0' }}>{err}</p>
                ))}
              </div>
            )}
            <button
              onClick={() => { setView('list'); setCsvText(''); setImportResult(null); }}
              style={{ background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', border: 'none', cursor: 'pointer', padding: '10px 20px', fontSize: 14, fontFamily: 'var(--font-body)', fontWeight: 500 }}
            >
              View Guest List
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ maxWidth: 800 }}>
        <button
          onClick={() => setView('import-upload')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, fontFamily: 'var(--font-body)' }}
        >
          &larr; Back
        </button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
          Review Column Mapping
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginBottom: 24 }}>
          {csvTotalRows} rows found &middot; ~{estimatedGuests} guests will be created (including partners &amp; children). Verify the column mapping below, then import.
        </p>

        {/* Column mapping - grouped */}
        {(() => {
          const fieldGroups: { label: string; fields: { key: keyof ColumnMapping; label: string }[] }[] = [
            { label: 'Primary Guest', fields: [
              { key: 'title', label: 'Title' },
              { key: 'first_name', label: 'First Name' },
              { key: 'last_name', label: 'Last Name' },
              { key: 'suffix', label: 'Suffix' },
            ]},
            { label: 'Contact', fields: [
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
              { key: 'relationship', label: 'Relationship to Couple' },
              { key: 'group_label', label: 'Group / Table' },
              { key: 'rsvp_status', label: 'RSVP Status' },
            ]},
            { label: 'Address', fields: [
              { key: 'address_line1', label: 'Street Address' },
              { key: 'address_line2', label: 'Street Address (line 2)' },
              { key: 'city', label: 'City' },
              { key: 'state', label: 'State / Region' },
              { key: 'zip', label: 'Zip / Postal Code' },
              { key: 'country', label: 'Country' },
            ]},
            { label: 'Partner', fields: [
              { key: 'partner_title', label: 'Partner Title' },
              { key: 'partner_first_name', label: 'Partner First Name' },
              { key: 'partner_last_name', label: 'Partner Last Name' },
              { key: 'partner_suffix', label: 'Partner Suffix' },
            ]},
            { label: 'Children', fields: [
              { key: 'child1_first_name', label: 'Child 1 First Name' },
              { key: 'child1_last_name', label: 'Child 1 Last Name' },
              { key: 'child2_first_name', label: 'Child 2 First Name' },
              { key: 'child2_last_name', label: 'Child 2 Last Name' },
              { key: 'child3_first_name', label: 'Child 3 First Name' },
              { key: 'child3_last_name', label: 'Child 3 Last Name' },
              { key: 'child4_first_name', label: 'Child 4 First Name' },
              { key: 'child4_last_name', label: 'Child 4 Last Name' },
              { key: 'child5_first_name', label: 'Child 5 First Name' },
              { key: 'child5_last_name', label: 'Child 5 Last Name' },
            ]},
            { label: 'Invite Counts', fields: [
              { key: 'total_definitely_invited', label: 'Total Definitely Invited' },
              { key: 'total_maybe_invited', label: 'Total Maybe Invited' },
            ]},
          ];

          // Only show groups that have at least one mapped field or relevant headers
          const hasAnyMapping = (fields: { key: keyof ColumnMapping }[]) =>
            fields.some((f) => csvMapping[f.key]);

          return fieldGroups.map((group) => {
            // Always show Primary Guest and Contact; show others only if they have mappings
            const alwaysShow = ['Primary Guest', 'Contact'];
            const shouldShow = alwaysShow.includes(group.label) || hasAnyMapping(group.fields);
            if (!shouldShow) return null;

            return (
              <div key={group.label} style={{ padding: 20, background: 'var(--bg-pure-white)', marginBottom: 12, borderRadius: 16, border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 14, marginBottom: 12, color: 'var(--text-primary)' }}>
                  {group.label}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {group.fields.map((field) => (
                    <div key={field.key}>
                      <label style={{ ...labelStyle, fontSize: 11 }}>{field.label}</label>
                      <select
                        style={{ ...inputStyle, fontSize: 13 }}
                        value={csvMapping[field.key] || ''}
                        onChange={(e) => updateMapping(field.key, e.target.value || null)}
                      >
                        <option value="">-- Not mapped --</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          });
        })()}

        {/* Preview table */}
        {csvPreview.length > 0 && (
          <div style={{ padding: 20, background: 'var(--bg-pure-white)', marginBottom: 20, overflowX: 'auto', borderRadius: 16, border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 12, color: 'var(--text-primary)' }}>
              Preview (first {csvPreview.length} rows)
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {csvHeaders.map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvPreview.map((row, i) => (
                  <tr key={i}>
                    {csvHeaders.map((h) => (
                      <td key={h} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-primary)' }}>
                        {row[h] || ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <p style={{ color: 'var(--color-terracotta)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleImport} disabled={importLoading} style={{ opacity: importLoading ? 0.5 : 1, background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', border: 'none', cursor: 'pointer', padding: '10px 20px', fontSize: 14, fontFamily: 'var(--font-body)', fontWeight: 500 }}>
            {importLoading ? 'Importing...' : `Import ~${estimatedGuests} Guests`}
          </button>
          <button onClick={() => setView('import-upload')} style={{ border: '1px solid var(--border-light)', borderRadius: 10, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer', padding: '10px 20px', fontSize: 14, fontFamily: 'var(--font-body)', fontWeight: 500 }}>
            Back
          </button>
        </div>
      </div>
    );
  }

  // ─── Guest List ───
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
            Guests
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginTop: 4 }}>
            {guests.length} guest{guests.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setView('import-upload'); setCsvText(''); setImportResult(null); setError(''); }} style={{ fontSize: 13, padding: '8px 16px', border: '1px solid var(--border-light)', borderRadius: 10, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
            Import CSV
          </button>
          <button onClick={() => { resetForm(); setView('add'); }} style={{ fontSize: 13, padding: '8px 16px', background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
            + Add Guest
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          style={{ ...inputStyle, maxWidth: 320 }}
          placeholder="Search guests..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && (
        <div style={{ padding: 24, borderRadius: 16, border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', background: 'var(--bg-pure-white)' }}>
          <div className="skeleton" style={{ width: '100%', height: 200 }} />
        </div>
      )}

      {!loading && guests.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', background: 'var(--bg-pure-white)', borderRadius: 16, border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px' }}>
            <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
          </svg>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>No guests yet</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16, maxWidth: 400, margin: '0 auto 16px' }}>
            Import a guest list from Zola or The Knot, or add guests manually.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button onClick={() => { setView('import-upload'); setCsvText(''); setError(''); }} style={{ fontSize: 13, border: '1px solid var(--border-light)', borderRadius: 10, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer', padding: '8px 16px', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
              Import CSV
            </button>
            <button onClick={() => { resetForm(); setView('add'); }} style={{ fontSize: 13, background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))', color: '#FDFBF7', borderRadius: 10, boxShadow: '0 2px 8px rgba(198,163,85,0.2)', border: 'none', cursor: 'pointer', padding: '8px 16px', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
              + Add Guest
            </button>
          </div>
        </div>
      )}

      {!loading && guests.length > 0 && selectedIds.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          marginBottom: 12,
          borderRadius: 10,
          background: 'rgba(196, 112, 75, 0.08)',
          border: '1px solid rgba(196, 112, 75, 0.2)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => setConfirmDelete({ type: 'batch', count: selectedIds.size })}
            disabled={batchDeleting}
            style={{
              background: 'var(--color-terracotta)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 500,
              cursor: batchDeleting ? 'not-allowed' : 'pointer',
              opacity: batchDeleting ? 0.6 : 1,
              fontFamily: 'var(--font-body)',
            }}
          >
            {batchDeleting ? 'Deleting...' : 'Delete Selected'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
          >
            Clear selection
          </button>
        </div>
      )}

      {!loading && guests.length > 0 && (
        <div style={{ background: 'var(--bg-pure-white)', overflow: 'hidden', borderRadius: 16, border: '1px solid var(--border-light)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: 40, padding: '12px 0 12px 16px', borderBottom: '1px solid var(--border-light)' }}>
                  <input
                    type="checkbox"
                    checked={guests.length > 0 && selectedIds.size === guests.length}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', accentColor: 'var(--color-terracotta)' }}
                  />
                </th>
                {['Name', 'Email', 'Phone', 'Group', 'RSVP', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '12px 16px',
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: 'var(--text-tertiary)',
                      borderBottom: '1px solid var(--border-light)',
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {guests.map((guest) => (
                <tr key={guest.id} style={{ borderBottom: '1px solid var(--border-light)', background: selectedIds.has(guest.id) ? 'rgba(196, 112, 75, 0.04)' : undefined }}>
                  <td style={{ width: 40, padding: '12px 0 12px 16px' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(guest.id)}
                      onChange={() => toggleSelect(guest.id)}
                      style={{ cursor: 'pointer', accentColor: 'var(--color-terracotta)' }}
                    />
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {guest.display_name}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                    {guest.email || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                    {guest.phone || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                    {guest.group_label || '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {rsvpBadge(guest.rsvp_status)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => startEdit(guest)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-terracotta)', marginRight: 12 }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() =>
                        setConfirmDelete({ type: 'single', id: guest.id, name: guest.display_name })
                      }
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PasswordConfirmDialog
        open={confirmDelete !== null}
        title={
          confirmDelete?.type === 'batch'
            ? `Delete ${confirmDelete.count} guest${confirmDelete.count !== 1 ? 's' : ''}?`
            : 'Delete this guest?'
        }
        description={
          confirmDelete?.type === 'batch' ? (
            <>
              This will permanently remove <strong>{confirmDelete.count}</strong> guest
              {confirmDelete.count !== 1 ? 's' : ''} from your list. This cannot be undone.
              Enter your password to confirm.
            </>
          ) : confirmDelete?.type === 'single' ? (
            <>
              This will permanently remove <strong>{confirmDelete.name}</strong> from your guest
              list. This cannot be undone. Enter your password to confirm.
            </>
          ) : (
            ''
          )
        }
        confirmLabel={confirmDelete?.type === 'batch' ? 'Delete guests' : 'Delete guest'}
        onConfirm={async () => {
          if (confirmDelete?.type === 'single') await performDelete(confirmDelete.id);
          else if (confirmDelete?.type === 'batch') await performBatchDelete();
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
