'use client';

import { useState, useEffect, useCallback, use } from 'react';

interface WeddingEvent {
  id: string;
  name: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue_name: string | null;
  venue_address: string | null;
  dress_code: string | null;
  description: string | null;
  logistics: string | null;
  accent_color: string | null;
  sort_order: number;
}

interface ParsedEvent {
  name: string;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  venue_name?: string | null;
  venue_address?: string | null;
  dress_code?: string | null;
  description?: string | null;
  logistics?: string | null;
}

type View = 'list' | 'add' | 'edit' | 'import';

export default function SettingsPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const [events, setEvents] = useState<WeddingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [error, setError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Form state
  const [editEvent, setEditEvent] = useState<WeddingEvent | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [dressCode, setDressCode] = useState('');
  const [description, setDescription] = useState('');
  const [logistics, setLogistics] = useState('');

  // Wedding timezone
  const [timezone, setTimezone] = useState('America/New_York');
  const [timezoneSaving, setTimezoneSaving] = useState(false);

  // Batch selection
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  // Bulk import state
  const [importText, setImportText] = useState('');
  const [importParsed, setImportParsed] = useState<ParsedEvent[] | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; total: number; errors: string[] } | null>(null);

  const handleImportPreview = async () => {
    if (!importText.trim()) return;
    setImportLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/events/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: importText, step: 'preview' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Failed to parse events');
        return;
      }
      setImportParsed(data.events);
    } catch {
      setError('Network error');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportConfirm = async () => {
    if (!importParsed || importParsed.length === 0) return;
    setImportLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/events/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'import', events: importParsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Import failed');
        return;
      }
      setImportResult(data);
      fetchEvents();
    } catch {
      setError('Network error');
    } finally {
      setImportLoading(false);
    }
  };

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/events`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [weddingId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Fetch wedding timezone
  useEffect(() => {
    fetch(`/api/v1/dashboard/weddings/${weddingId}/overview`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.wedding?.timezone) setTimezone(data.wedding.timezone);
      })
      .catch(() => {});
  }, [weddingId]);

  const handleTimezoneChange = async (newTz: string) => {
    setTimezone(newTz);
    setTimezoneSaving(true);
    try {
      await fetch(`/api/v1/dashboard/weddings/${weddingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: newTz }),
      });
    } catch {
      // Silently fail
    } finally {
      setTimezoneSaving(false);
    }
  };

  const resetForm = () => {
    setEditEvent(null);
    setName('');
    setDate('');
    setStartTime('');
    setEndTime('');
    setVenueName('');
    setVenueAddress('');
    setDressCode('');
    setDescription('');
    setLogistics('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setError('');

    const body = {
      name,
      date: date || undefined,
      start_time: startTime || undefined,
      end_time: endTime || undefined,
      venue_name: venueName || undefined,
      venue_address: venueAddress || undefined,
      dress_code: dressCode || undefined,
      description: description || undefined,
      logistics: logistics || undefined,
    };

    try {
      const url = editEvent
        ? `/api/v1/dashboard/weddings/${weddingId}/events/${editEvent.id}`
        : `/api/v1/dashboard/weddings/${weddingId}/events`;

      const res = await fetch(url, {
        method: editEvent ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message || 'Failed to save event');
        return;
      }

      resetForm();
      setView('list');
      fetchEvents();
    } catch {
      setError('Network error');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (eventId: string) => {
    if (!confirm('Delete this event?')) return;
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/events/${eventId}`, { method: 'DELETE' });
      if (res.ok) {
        setEvents((prev) => prev.filter((ev) => ev.id !== eventId));
      }
    } catch {
      // Silently fail
    }
  };

  const startEdit = (ev: WeddingEvent) => {
    setEditEvent(ev);
    setName(ev.name);
    setDate(ev.date || '');
    setStartTime(ev.start_time || '');
    setEndTime(ev.end_time || '');
    setVenueName(ev.venue_name || '');
    setVenueAddress(ev.venue_address || '');
    setDressCode(ev.dress_code || '');
    setDescription(ev.description || '');
    setLogistics(ev.logistics || '');
    setView('edit');
  };

  const toggleEventSelect = (id: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllEvents = () => {
    if (selectedEventIds.size === events.length) {
      setSelectedEventIds(new Set());
    } else {
      setSelectedEventIds(new Set(events.map((e) => e.id)));
    }
  };

  const handleBatchDeleteEvents = async () => {
    if (selectedEventIds.size === 0) return;
    if (!confirm(`Delete ${selectedEventIds.size} event${selectedEventIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBatchDeleting(true);
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/events/batch-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedEventIds) }),
      });
      if (res.ok) {
        setEvents((prev) => prev.filter((e) => !selectedEventIds.has(e.id)));
        setSelectedEventIds(new Set());
      }
    } catch {
      // Silently fail
    } finally {
      setBatchDeleting(false);
    }
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

  const formatTime = (t: string | null) => {
    if (!t) return '';
    try {
      const [h, m] = t.split(':');
      const hour = parseInt(h);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const h12 = hour % 12 || 12;
      return `${h12}:${m} ${ampm}`;
    } catch {
      return t;
    }
  };

  // ─── Bulk Import ───
  if (view === 'import') {
    // Import complete
    if (importResult) {
      return (
        <div style={{ maxWidth: 600 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 24 }}>
            Import Complete
          </h1>
          <div className="card" style={{ padding: 24, background: 'var(--bg-pure-white)' }}>
            <div style={{ textAlign: 'center', padding: 16, borderRadius: 12, background: 'rgba(122, 139, 92, 0.08)', marginBottom: 20 }}>
              <p style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-olive)', margin: 0 }}>{importResult.imported}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>events imported</p>
            </div>
            {importResult.errors.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-terracotta)', marginBottom: 8 }}>Errors:</p>
                {importResult.errors.map((err, i) => (
                  <p key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0' }}>{err}</p>
                ))}
              </div>
            )}
            <button className="btn-primary" onClick={() => { setView('list'); setImportText(''); setImportParsed(null); setImportResult(null); }}>
              View Events
            </button>
          </div>
        </div>
      );
    }

    // Preview parsed events
    if (importParsed) {
      return (
        <div style={{ maxWidth: 700 }}>
          <button
            onClick={() => setImportParsed(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, fontFamily: 'var(--font-body)' }}
          >
            &larr; Back to text
          </button>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
            Review Parsed Events
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
            {importParsed.length} event{importParsed.length !== 1 ? 's' : ''} detected. Review below, then import.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {importParsed.map((ev, i) => (
              <div key={i} className="card" style={{ padding: 20, background: 'var(--bg-pure-white)' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                  {ev.name}
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  {ev.start_time && <span>Time: {ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ''}</span>}
                  {ev.venue_name && <span>Venue: {ev.venue_name}</span>}
                  {ev.dress_code && <span>Dress: {ev.dress_code}</span>}
                </div>
                {ev.venue_address && (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 6px' }}>{ev.venue_address}</p>
                )}
                {ev.description && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 4px', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{ev.description}</p>
                )}
                {ev.logistics && (
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0', lineHeight: 1.4, whiteSpace: 'pre-line' }}>{ev.logistics}</p>
                )}
              </div>
            ))}
          </div>

          {error && <p style={{ color: 'var(--color-terracotta)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-primary" onClick={handleImportConfirm} disabled={importLoading} style={{ opacity: importLoading ? 0.5 : 1 }}>
              {importLoading ? 'Importing...' : `Import ${importParsed.length} Events`}
            </button>
            <button className="btn-ghost" onClick={() => setImportParsed(null)}>
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
          onClick={() => { setView('list'); setImportText(''); setError(''); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, fontFamily: 'var(--font-body)' }}
        >
          &larr; Back to events
        </button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
          Import Events
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>
          Paste your event details from Zola, The Knot, or any wedding website. We'll use AI to extract event names, times, venues, dress codes, and descriptions.
        </p>

        <div className="card" style={{ padding: 24, background: 'var(--bg-pure-white)' }}>
          <textarea
            style={{ ...inputStyle, minHeight: 200, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'Paste event details here...\n\nExample:\n\nHaldi (Pithi)\n3:30 pm - 7:30 pm\n\nThe Garden at the Hotel Estela.\n\nWear light colors!\n\nSangeet\n4:00 pm - 11:45 pm\n\nXalet del Nin.\nDress colorfully and come ready to party!'}
          />

          {error && <p style={{ color: 'var(--color-terracotta)', fontSize: 13, marginTop: 12 }}>{error}</p>}

          <button
            className="btn-primary"
            onClick={handleImportPreview}
            disabled={!importText.trim() || importLoading}
            style={{ marginTop: 16, opacity: !importText.trim() || importLoading ? 0.5 : 1 }}
          >
            {importLoading ? 'Analyzing...' : 'Parse Events'}
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
          &larr; Back to events
        </button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 24 }}>
          {view === 'edit' ? 'Edit Event' : 'Add Event'}
        </h1>

        <form onSubmit={handleSubmit} className="card" style={{ padding: 24, background: 'var(--bg-pure-white)' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Event Name *</label>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Ceremony, Reception, Mehndi" required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Start Time</label>
              <input style={inputStyle} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>End Time</label>
              <input style={inputStyle} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Venue Name</label>
              <input style={inputStyle} value={venueName} onChange={(e) => setVenueName(e.target.value)} placeholder="e.g., The Grand Ballroom" />
            </div>
            <div>
              <label style={labelStyle}>Dress Code</label>
              <input style={inputStyle} value={dressCode} onChange={(e) => setDressCode(e.target.value)} placeholder="e.g., Black Tie, Formal" />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Venue Address</label>
            <input style={inputStyle} value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} placeholder="123 Main St, City, State" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description</label>
            <textarea
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell guests about this event..."
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Logistics / Notes</label>
            <textarea
              style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              value={logistics}
              onChange={(e) => setLogistics(e.target.value)}
              placeholder="Parking info, shuttle details, etc."
            />
          </div>

          {error && <p style={{ color: 'var(--color-terracotta)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 12 }}>
            <button type="submit" className="btn-primary" disabled={formLoading} style={{ opacity: formLoading ? 0.7 : 1 }}>
              {formLoading ? 'Saving...' : view === 'edit' ? 'Update Event' : 'Add Event'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => { resetForm(); setView('list'); }}>Cancel</button>
          </div>
        </form>
      </div>
    );
  }

  // ─── Event List ───

  const timezoneOptions = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Anchorage', 'Pacific/Honolulu', 'America/Phoenix',
    'America/Toronto', 'America/Vancouver',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid',
    'Europe/Amsterdam', 'Europe/Zurich', 'Europe/Athens', 'Europe/Istanbul',
    'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore',
    'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
    'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
    'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Cairo',
    'America/Mexico_City', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  ];
  if (!timezoneOptions.includes(timezone)) timezoneOptions.unshift(timezone);

  const formatTzLabel = (tz: string) => {
    try {
      const label = tz.replace(/_/g, ' ').replace(/\//g, ' / ');
      const offset = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
        .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value || '';
      return `${label} (${offset})`;
    } catch {
      return tz;
    }
  };

  return (
    <div>
      {/* Timezone Setting */}
      <div className="card" style={{ padding: 20, background: 'var(--bg-pure-white)', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 4px' }}>
              Wedding Timezone
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
              Event times display in this timezone for your guests.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              style={{ ...inputStyle, width: 'auto', minWidth: 240, fontSize: 13 }}
              value={timezone}
              onChange={(e) => handleTimezoneChange(e.target.value)}
            >
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>{formatTzLabel(tz)}</option>
              ))}
            </select>
            {timezoneSaving && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Saving...</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
            Events
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Manage your wedding events — ceremony, reception, mehndi, etc.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => { setView('import'); setImportText(''); setImportParsed(null); setImportResult(null); setError(''); }} style={{ fontSize: 13, padding: '8px 16px' }}>
            Import Events
          </button>
          <button className="btn-primary" onClick={() => { resetForm(); setView('add'); }} style={{ fontSize: 13, padding: '8px 16px' }}>
            + Add Event
          </button>
        </div>
      </div>

      {loading && (
        <div className="card p-6">
          <div className="skeleton" style={{ width: '100%', height: 200 }} />
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="card" style={{ padding: 48, textAlign: 'center', background: 'var(--bg-pure-white)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px' }}>
            <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>No events yet</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16, maxWidth: 400, margin: '0 auto 16px' }}>
            Add your wedding events so guests know when and where to go.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={() => { setView('import'); setImportText(''); setImportParsed(null); setImportResult(null); setError(''); }} style={{ fontSize: 13 }}>
              Import Events
            </button>
            <button className="btn-primary" onClick={() => { resetForm(); setView('add'); }} style={{ fontSize: 13 }}>
              + Add Event
            </button>
          </div>
        </div>
      )}

      {!loading && events.length > 0 && (
        <>
        {/* Batch controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
            <input
              type="checkbox"
              checked={events.length > 0 && selectedEventIds.size === events.length}
              onChange={toggleSelectAllEvents}
              style={{ cursor: 'pointer', accentColor: 'var(--color-terracotta)' }}
            />
            Select all
          </label>
          {selectedEventIds.size > 0 && (
            <>
              <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                {selectedEventIds.size} selected
              </span>
              <button
                onClick={handleBatchDeleteEvents}
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
                onClick={() => setSelectedEventIds(new Set())}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)' }}
              >
                Clear
              </button>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map((ev) => (
            <div key={ev.id} className="card" style={{ padding: 20, background: 'var(--bg-pure-white)', border: selectedEventIds.has(ev.id) ? '1.5px solid rgba(196, 112, 75, 0.4)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={selectedEventIds.has(ev.id)}
                    onChange={() => toggleEventSelect(ev.id)}
                    style={{ cursor: 'pointer', accentColor: 'var(--color-terracotta)', marginTop: 4, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                      {ev.name}
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                      {ev.date && (
                        <span>
                          {new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone })}
                        </span>
                      )}
                      {(ev.start_time || ev.end_time) && (
                        <span>{formatTime(ev.start_time)}{ev.end_time ? ` – ${formatTime(ev.end_time)}` : ''}</span>
                      )}
                      {ev.venue_name && <span>{ev.venue_name}</span>}
                      {ev.dress_code && (
                        <span style={{ background: 'var(--bg-soft-cream)', padding: '1px 8px', borderRadius: 999, fontSize: 11 }}>
                          {ev.dress_code}
                        </span>
                      )}
                    </div>
                    {ev.description && (
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{ev.description}</p>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
                  <button
                    onClick={() => startEdit(ev)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-terracotta)' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(ev.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-tertiary)' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
