'use client';

import { useState, useEffect, useCallback } from 'react';

interface PhotoItem {
  id: string;
  thumbnail_url: string;
  url: string;
  couple_approved: boolean;
  guest_name: string;
  created_at: string;
}

type FilterMode = 'all' | 'approved' | 'rejected';

export default function GalleryCurationPage({
  params,
}: {
  params: Promise<{ weddingId: string }>;
}) {
  const [weddingId, setWeddingId] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [counts, setCounts] = useState({ approved: 0, rejected: 0, total: 0 });
  const [filter, setFilter] = useState<FilterMode>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoItem | null>(null);

  useEffect(() => {
    params.then((p) => setWeddingId(p.weddingId));
  }, [params]);

  const fetchPhotos = useCallback(async (filterMode: FilterMode, cursor?: string | null) => {
    if (!weddingId) return;
    const qs = new URLSearchParams({ limit: '60' });
    if (filterMode !== 'all') qs.set('filter', filterMode);
    if (cursor) qs.set('cursor', cursor);

    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/gallery-curation?${qs}`);
      const data = await res.json();
      if (data.data) {
        if (cursor) {
          setPhotos((prev) => [...prev, ...data.data.items]);
        } else {
          setPhotos(data.data.items);
        }
        setNextCursor(data.data.next_cursor);
        setCounts(data.data.counts);
      }
    } catch {
      console.error('Failed to fetch photos');
    }
  }, [weddingId]);

  useEffect(() => {
    if (!weddingId) return;
    setLoading(true);
    setSelectedIds(new Set());
    fetchPhotos(filter).finally(() => setLoading(false));
  }, [weddingId, filter, fetchPhotos]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await fetchPhotos(filter, nextCursor);
    setLoadingMore(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === photos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(photos.map((p) => p.id)));
    }
  };

  const handleBulkUpdate = async (approved: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkUpdating(true);
    try {
      await fetch(`/api/v1/dashboard/weddings/${weddingId}/gallery-curation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_ids: Array.from(selectedIds), approved }),
      });
      // Update local state
      setPhotos((prev) =>
        prev.map((p) => selectedIds.has(p.id) ? { ...p, couple_approved: approved } : p)
      );
      // Update counts
      const delta = selectedIds.size;
      setCounts((prev) => ({
        ...prev,
        approved: approved ? prev.approved + delta : prev.approved - delta,
        rejected: approved ? prev.rejected - delta : prev.rejected + delta,
      }));
      setSelectedIds(new Set());
    } catch {
      alert('Failed to update photos');
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleSingleToggle = async (photo: PhotoItem) => {
    const newApproved = !photo.couple_approved;
    try {
      await fetch(`/api/v1/dashboard/weddings/${weddingId}/gallery-curation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_ids: [photo.id], approved: newApproved }),
      });
      setPhotos((prev) =>
        prev.map((p) => p.id === photo.id ? { ...p, couple_approved: newApproved } : p)
      );
      setCounts((prev) => ({
        ...prev,
        approved: newApproved ? prev.approved + 1 : prev.approved - 1,
        rejected: newApproved ? prev.rejected - 1 : prev.rejected + 1,
      }));
    } catch {
      alert('Failed to update photo');
    }
  };

  if (loading) {
    return (
      <div>
        <div className="skeleton h-8 w-64 mb-6" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ aspectRatio: '1/1' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          fontWeight: 500,
          color: 'var(--text-primary)',
          marginBottom: 8,
        }}
      >
        Curate Gallery
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Review guest photos and remove any you don&apos;t want showing in memoir page carousels.
        All photos are approved by default &mdash; click to reject specific ones.
      </p>

      {/* Counts & Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { id: 'all' as FilterMode, label: `All (${counts.total})` },
            { id: 'approved' as FilterMode, label: `Approved (${counts.approved})` },
            { id: 'rejected' as FilterMode, label: `Rejected (${counts.rejected})` },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                fontFamily: 'var(--font-body)',
                cursor: 'pointer',
                border: filter === tab.id ? '1.5px solid var(--color-terracotta)' : '1px solid var(--border-medium)',
                background: filter === tab.id ? 'rgba(196, 112, 75, 0.06)' : 'var(--bg-pure-white)',
                color: filter === tab.id ? 'var(--color-terracotta)' : 'var(--text-secondary)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => handleBulkUpdate(true)}
              disabled={bulkUpdating}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                background: 'rgba(122, 139, 92, 0.1)',
                color: 'var(--color-olive)',
                border: '1px solid var(--color-olive)',
                cursor: 'pointer',
                opacity: bulkUpdating ? 0.5 : 1,
              }}
            >
              Approve
            </button>
            <button
              onClick={() => handleBulkUpdate(false)}
              disabled={bulkUpdating}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                background: 'rgba(239, 68, 68, 0.06)',
                color: '#ef4444',
                border: '1px solid #ef4444',
                cursor: 'pointer',
                opacity: bulkUpdating ? 0.5 : 1,
              }}
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {/* Select All */}
      {photos.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={selectAll}
            style={{
              fontSize: 12,
              color: 'var(--text-tertiary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontFamily: 'var(--font-body)',
            }}
          >
            {selectedIds.size === photos.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>
      )}

      {/* Photo Grid */}
      {photos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: 16 }}>
            {filter === 'rejected' ? 'No rejected photos' : filter === 'approved' ? 'No approved photos' : 'No photos uploaded yet'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 4 }}>
          {photos.map((photo) => {
            const isSelected = selectedIds.has(photo.id);
            const isRejected = !photo.couple_approved;
            return (
              <div
                key={photo.id}
                style={{
                  position: 'relative',
                  aspectRatio: '1/1',
                  overflow: 'hidden',
                  borderRadius: 4,
                  cursor: 'pointer',
                  outline: isSelected ? '3px solid var(--color-terracotta)' : 'none',
                  outlineOffset: -3,
                  opacity: isRejected ? 0.4 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumbnail_url}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                  onClick={() => toggleSelect(photo.id)}
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (img.src !== photo.url) img.src = photo.url;
                  }}
                />

                {/* Guest name tooltip */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '16px 6px 4px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)',
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.8)',
                    pointerEvents: 'none',
                  }}
                >
                  {photo.guest_name}
                </div>

                {/* Approval toggle button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleSingleToggle(photo); }}
                  title={isRejected ? 'Click to approve' : 'Click to reject'}
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isRejected ? 'rgba(239, 68, 68, 0.8)' : 'rgba(122, 139, 92, 0.85)',
                    border: '2px solid white',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'white',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {isRejected ? '\u2715' : '\u2713'}
                </button>

                {/* Selection checkbox */}
                <div
                  style={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    background: isSelected ? 'var(--color-terracotta)' : 'rgba(255,255,255,0.3)',
                    border: isSelected ? '2px solid var(--color-terracotta)' : '2px solid white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                    fontSize: 11,
                    color: 'white',
                    fontWeight: 700,
                  }}
                >
                  {isSelected && '\u2713'}
                </div>

                {/* Expand button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setLightboxPhoto(photo); }}
                  style={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    background: 'rgba(0,0,0,0.4)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Load More */}
      {nextCursor && (
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={loadMore}
            disabled={loadingMore}
            style={{
              padding: '8px 24px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              background: 'var(--color-gold-faint)',
              color: 'var(--color-gold)',
              border: '0.5px solid var(--color-gold-rule)',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            zIndex: 60,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setLightboxPhoto(null)}
        >
          <button
            onClick={() => setLightboxPhoto(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'white',
              zIndex: 61,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxPhoto.url}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 8 }}
            onClick={(e) => e.stopPropagation()}
          />

          <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
              by {lightboxPhoto.guest_name}
            </span>
            <button
              onClick={() => handleSingleToggle(lightboxPhoto).then(() => {
                setLightboxPhoto((prev) => prev ? { ...prev, couple_approved: !prev.couple_approved } : null);
              })}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                background: lightboxPhoto.couple_approved ? 'rgba(239, 68, 68, 0.15)' : 'rgba(122, 139, 92, 0.15)',
                color: lightboxPhoto.couple_approved ? '#ef4444' : 'var(--color-olive)',
                border: `1.5px solid ${lightboxPhoto.couple_approved ? '#ef4444' : 'var(--color-olive)'}`,
                cursor: 'pointer',
              }}
            >
              {lightboxPhoto.couple_approved ? 'Reject Photo' : 'Approve Photo'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
