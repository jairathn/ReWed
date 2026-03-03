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

type View = 'list' | 'add' | 'edit';

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
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
            Events
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            Manage your wedding events — ceremony, reception, mehndi, etc.
          </p>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setView('add'); }} style={{ fontSize: 13, padding: '8px 16px' }}>
          + Add Event
        </button>
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
          <button className="btn-primary" onClick={() => { resetForm(); setView('add'); }} style={{ fontSize: 13 }}>
            + Add Your First Event
          </button>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map((ev) => (
            <div key={ev.id} className="card" style={{ padding: 20, background: 'var(--bg-pure-white)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                    {ev.name}
                  </h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                    {ev.date && (
                      <span>
                        {new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>{ev.description}</p>
                  )}
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
      )}
    </div>
  );
}
