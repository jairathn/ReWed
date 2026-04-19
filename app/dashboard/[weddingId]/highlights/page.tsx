'use client';

import { useState, useEffect, useCallback } from 'react';
import { vendorColorByName } from '@/lib/utils/vendor-color';

interface GuestOption {
  id: string;
  name: string;
  memoir_published: boolean;
}

interface ReelItem {
  id: string;
  guest_id: string;
  guest_name: string;
  type: 'keeper' | 'reel';
  url: string | null;
  status: string;
  created_at: string;
}

interface MemoirMsg {
  id: string;
  guest_id: string;
  guest_name: string;
  message: string;
}

export default function HighlightsPage({
  params,
}: {
  params: Promise<{ weddingId: string }>;
}) {
  const [weddingId, setWeddingId] = useState('');
  const [guests, setGuests] = useState<GuestOption[]>([]);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [messages, setMessages] = useState<MemoirMsg[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload form state
  const [selectedGuest, setSelectedGuest] = useState('');
  const [selectedType, setSelectedType] = useState<'keeper' | 'reel'>('keeper');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // Message form state
  const [msgGuest, setMsgGuest] = useState('');
  const [msgText, setMsgText] = useState('');
  const [savingMsg, setSavingMsg] = useState(false);
  const [publishingGuest, setPublishingGuest] = useState<string | null>(null);
  const [galleryPublished, setGalleryPublished] = useState(false);
  const [togglingGallery, setTogglingGallery] = useState(false);

  useEffect(() => {
    params.then((p) => setWeddingId(p.weddingId));
  }, [params]);

  const fetchData = useCallback(async () => {
    if (!weddingId) return;
    try {
      const [reelsRes, msgsRes] = await Promise.all([
        fetch(`/api/v1/dashboard/weddings/${weddingId}/highlight-reels`),
        fetch(`/api/v1/dashboard/weddings/${weddingId}/memoir-messages`),
      ]);
      const reelsData = await reelsRes.json();
      const msgsData = await msgsRes.json();

      if (reelsData.data) {
        setReels(reelsData.data.reels);
        setGuests(reelsData.data.guests);
        setGalleryPublished(reelsData.data.gallery_published ?? false);
      }
      if (msgsData.data) {
        setMessages(msgsData.data.messages);
      }
    } catch {
      console.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [weddingId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpload = async () => {
    if (!uploadFile || !selectedGuest || !weddingId) return;
    setUploading(true);
    setUploadProgress('Getting upload URL...');

    try {
      // Step 1: Get presigned URL
      const presignRes = await fetch(
        `/api/v1/dashboard/weddings/${weddingId}/highlight-reels`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guest_id: selectedGuest,
            type: selectedType,
            action: 'presign',
            content_type: uploadFile.type,
            content_length: uploadFile.size,
          }),
        }
      );
      const presignData = await presignRes.json();
      if (!presignRes.ok) {
        throw new Error(presignData.error?.message || 'Failed to get upload URL');
      }

      // Step 2: Upload to R2
      setUploadProgress('Uploading video...');
      const uploadRes = await fetch(presignData.data.upload_url, {
        method: 'PUT',
        body: uploadFile,
        headers: { 'Content-Type': uploadFile.type },
      });
      if (!uploadRes.ok) throw new Error('Upload failed');

      // Step 3: Mark as complete
      setUploadProgress('Finalizing...');
      await fetch(`/api/v1/dashboard/weddings/${weddingId}/highlight-reels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_id: selectedGuest,
          type: selectedType,
          action: 'complete',
          reel_id: presignData.data.reel_id,
          size_bytes: uploadFile.size,
        }),
      });

      setUploadProgress('Done!');
      setUploadFile(null);
      setSelectedGuest('');
      fetchData();
    } catch (err) {
      setUploadProgress(`Error: ${err instanceof Error ? err.message : 'Upload failed'}`);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(''), 3000);
    }
  };

  const handleSaveMessage = async () => {
    if (!msgGuest || !msgText.trim() || !weddingId) return;
    setSavingMsg(true);
    try {
      await fetch(`/api/v1/dashboard/weddings/${weddingId}/memoir-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_id: msgGuest, message: msgText.trim() }),
      });
      setMsgGuest('');
      setMsgText('');
      fetchData();
    } catch {
      alert('Failed to save message');
    } finally {
      setSavingMsg(false);
    }
  };

  const handleTogglePublish = async (guestId: string, currentlyPublished: boolean) => {
    if (!weddingId) return;
    setPublishingGuest(guestId);
    try {
      await fetch(`/api/v1/dashboard/weddings/${weddingId}/highlight-reels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_id: guestId,
          action: currentlyPublished ? 'unpublish' : 'publish',
        }),
      });
      // Update local state immediately
      setGuests((prev) =>
        prev.map((g) => g.id === guestId ? { ...g, memoir_published: !currentlyPublished } : g)
      );
    } catch {
      alert('Failed to update publish status');
    } finally {
      setPublishingGuest(null);
    }
  };

  const handleToggleGallery = async () => {
    if (!weddingId) return;
    setTogglingGallery(true);
    try {
      await fetch(`/api/v1/dashboard/weddings/${weddingId}/highlight-reels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: galleryPublished ? 'gallery_unpublish' : 'gallery_publish',
        }),
      });
      setGalleryPublished(!galleryPublished);
    } catch {
      alert('Failed to update gallery status');
    } finally {
      setTogglingGallery(false);
    }
  };

  // Group reels by guest
  const reelsByGuest: Record<string, { name: string; keeper?: ReelItem; reel?: ReelItem }> = {};
  for (const r of reels) {
    if (!reelsByGuest[r.guest_id]) {
      reelsByGuest[r.guest_id] = { name: r.guest_name };
    }
    (reelsByGuest[r.guest_id] as Record<string, unknown>)[r.type] = r;
  }

  // Guests without reels
  const guestsWithReels = new Set(reels.map((r) => r.guest_id));
  const guestsWithoutReels = guests.filter((g) => !guestsWithReels.has(g.id));

  if (loading) {
    return (
      <div>
        <div className="skeleton h-8 w-64 mb-6" />
        <div className="skeleton h-40 w-full mb-4" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          fontWeight: 500,
          color: 'var(--text-primary)',
          marginBottom: 8,
        }}
      >
        Highlight Reels & Memoir Messages
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginBottom: 20 }}>
        Upload personalized highlight reels and write thank-you messages for each guest&apos;s memoir page.
      </p>

      {/* Progress stats */}
      {guests.length > 0 && (() => {
        const publishedCount = guests.filter((g) => g.memoir_published).length;
        const withReelsCount = new Set(reels.map((r) => r.guest_id)).size;
        const withMsgCount = new Set(messages.map((m) => m.guest_id)).size;
        const pct = guests.length > 0 ? Math.round((publishedCount / guests.length) * 100) : 0;
        return (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 14,
              background: 'var(--bg-pure-white)',
              border: '1px solid var(--border-light)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              marginBottom: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                Memoir rollout
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                {publishedCount} of {guests.length} published · {pct}%
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: 'var(--bg-soft-cream)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--color-olive), var(--color-gold))',
                  transition: 'width 0.3s',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
              <span>
                <strong style={{ color: 'var(--color-olive)' }}>{withReelsCount}</strong>
                {' '}with reels
              </span>
              <span>
                <strong style={{ color: 'var(--color-gold-dark)' }}>{withMsgCount}</strong>
                {' '}with messages
              </span>
              <span>
                <strong style={{ color: 'var(--color-terracotta)' }}>
                  {guests.length - withReelsCount}
                </strong>
                {' '}still missing reels
              </span>
            </div>
          </div>
        );
      })()}

      {/* ── Gallery Approval Gate ── */}
      <div
        style={{
          borderRadius: 16,
          background: 'var(--bg-pure-white)',
          border: galleryPublished ? '1.5px solid var(--color-olive)' : '1px solid var(--border-light)',
          padding: 20,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 4, color: 'var(--text-primary)' }}>
            Shared Gallery
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            {galleryPublished
              ? 'Gallery photos are visible on memoir pages. Guest photos appear in the background carousels.'
              : 'Approve the shared gallery to show guest photos in memoir page carousels. Memoirs won\u2019t show carousel photos until this is enabled.'}
          </p>
        </div>
        <button
          onClick={handleToggleGallery}
          disabled={togglingGallery}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'var(--font-body)',
            cursor: togglingGallery ? 'wait' : 'pointer',
            border: 'none',
            background: galleryPublished ? 'var(--color-olive)' : 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
            color: '#FDFBF7',
            boxShadow: '0 2px 8px rgba(198,163,85,0.2)',
            opacity: togglingGallery ? 0.5 : 1,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {togglingGallery ? '...' : galleryPublished ? 'Approved' : 'Approve Gallery'}
        </button>
      </div>

      {/* ── Upload Section ── */}
      <div
        style={{ borderRadius: 16, background: 'var(--bg-pure-white)', border: '1px solid var(--border-light)', padding: 24, marginBottom: 24 }}
      >
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 16, color: 'var(--text-primary)' }}>
          Upload Highlight Reel
        </h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Guest</label>
            <select
              value={selectedGuest}
              onChange={(e) => setSelectedGuest(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-medium)',
                fontSize: 14,
                fontFamily: 'var(--font-body)',
                background: 'var(--bg-pure-white)',
              }}
            >
              <option value="">Select guest...</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 150 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as 'keeper' | 'reel')}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-medium)',
                fontSize: 14,
                fontFamily: 'var(--font-body)',
                background: 'var(--bg-pure-white)',
              }}
            >
              <option value="keeper">Full Edit (2 min)</option>
              <option value="reel">Social Reel (20 sec)</option>
            </select>
          </div>

          <div style={{ minWidth: 200 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Video File</label>
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              style={{ fontSize: 13 }}
            />
          </div>

          <button
            onClick={handleUpload}
            disabled={!selectedGuest || !uploadFile || uploading}
            style={{
              padding: '10px 24px',
              fontSize: 14,
              background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
              color: '#FDFBF7',
              borderRadius: 10,
              boxShadow: '0 2px 8px rgba(198,163,85,0.2)',
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              border: 'none',
              cursor: 'pointer',
              opacity: (!selectedGuest || !uploadFile || uploading) ? 0.5 : 1,
            }}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
        {uploadProgress && (
          <p style={{ fontSize: 13, marginTop: 8, color: uploadProgress.startsWith('Error') ? '#ef4444' : 'var(--color-olive)' }}>
            {uploadProgress}
          </p>
        )}
      </div>

      {/* ── Memoir Message Section ── */}
      <div style={{ borderRadius: 16, background: 'var(--bg-pure-white)', border: '1px solid var(--border-light)', padding: 24, marginBottom: 32 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 16, color: 'var(--text-primary)' }}>
          Write a Thank-You Message
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          This appears on the back of their memoir card when they click &quot;For You&quot;.
        </p>
        <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
          <select
            value={msgGuest}
            onChange={(e) => {
              setMsgGuest(e.target.value);
              // Pre-fill existing message if available
              const existing = messages.find((m) => m.guest_id === e.target.value);
              setMsgText(existing?.message || '');
            }}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--border-medium)',
              fontSize: 14,
              fontFamily: 'var(--font-body)',
              background: 'var(--bg-pure-white)',
              maxWidth: 300,
            }}
          >
            <option value="">Select guest...</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>

          <textarea
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            placeholder="Thank you for being part of our special day..."
            maxLength={2000}
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--border-medium)',
              fontSize: 14,
              fontFamily: 'var(--font-body)',
              minHeight: 100,
              resize: 'vertical',
              background: 'var(--bg-pure-white)',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{msgText.length}/2000</span>
            <button
              onClick={handleSaveMessage}
              disabled={!msgGuest || !msgText.trim() || savingMsg}
              style={{
                padding: '10px 24px',
                fontSize: 14,
                background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
                color: '#FDFBF7',
                borderRadius: 10,
                boxShadow: '0 2px 8px rgba(198,163,85,0.2)',
                fontWeight: 600,
                fontFamily: 'var(--font-body)',
                border: 'none',
                cursor: 'pointer',
                opacity: (!msgGuest || !msgText.trim() || savingMsg) ? 0.5 : 1,
              }}
            >
              {savingMsg ? 'Saving...' : 'Save Message'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Status Overview ── */}
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 500,
          color: 'var(--text-primary)',
          marginBottom: 16,
        }}
      >
        Status Overview
      </h2>

      {/* Guests with reels */}
      {Object.entries(reelsByGuest).length > 0 && (
        <div style={{ display: 'grid', gap: 12, marginBottom: 24 }}>
          {Object.entries(reelsByGuest).map(([guestId, data]) => {
            const guestInfo = guests.find((g) => g.id === guestId);
            const isPublished = guestInfo?.memoir_published ?? false;
            const isPublishing = publishingGuest === guestId;
            const name = String(data.name || 'Guest');
            const color = vendorColorByName(name);
            const initials = name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? '')
              .join('') || '·';
            return (
              <div
                key={guestId}
                style={{
                  borderRadius: 16,
                  background: 'var(--bg-pure-white)',
                  border: isPublished ? '1.5px solid rgba(122,139,92,0.35)' : '1px solid var(--border-light)',
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: color + '22',
                    color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {initials}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <p style={{ fontWeight: 500, fontSize: 15, color: 'var(--text-primary)', margin: 0 }}>
                      {name}
                    </p>
                    {isPublished && (
                      <span
                        style={{
                          fontSize: 10,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          color: 'var(--color-olive)',
                          background: 'rgba(122,139,92,0.12)',
                          padding: '2px 7px',
                          borderRadius: 999,
                          fontWeight: 600,
                        }}
                      >
                        Published
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <StatusBadge label="Full Edit" status={data.keeper?.status} />
                    <StatusBadge label="Social Reel" status={data.reel?.status} />
                    <StatusBadge
                      label="Message"
                      status={messages.some((m) => m.guest_id === guestId) ? 'ready' : undefined}
                    />
                  </div>
                </div>
                <button
                  onClick={() => handleTogglePublish(guestId, isPublished)}
                  disabled={isPublishing}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'var(--font-body)',
                    cursor: isPublishing ? 'wait' : 'pointer',
                    border: isPublished ? '1px solid var(--border-light)' : 'none',
                    background: isPublished
                      ? 'var(--bg-pure-white)'
                      : 'linear-gradient(135deg, var(--color-olive), #6A7A4E)',
                    color: isPublished ? 'var(--text-secondary)' : '#FDFBF7',
                    boxShadow: isPublished ? 'none' : '0 2px 8px rgba(122,139,92,0.25)',
                    opacity: isPublishing ? 0.5 : 1,
                    flexShrink: 0,
                  }}
                >
                  {isPublishing ? '...' : isPublished ? 'Unpublish' : 'Publish'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Guests without reels */}
      {guestsWithoutReels.length > 0 && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {guestsWithoutReels.length} guest{guestsWithoutReels.length !== 1 ? 's' : ''} still need highlight reels:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
            {guestsWithoutReels.map((g) => {
              const color = vendorColorByName(g.name);
              return (
                <span
                  key={g.id}
                  style={{
                    fontSize: 12,
                    padding: '3px 10px 3px 8px',
                    borderRadius: 999,
                    background: color + '14',
                    color,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: color,
                      display: 'inline-block',
                    }}
                  />
                  {g.name}
                </span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ label, status }: { label: string; status?: string }) {
  const isReady = status === 'ready';
  return (
    <span
      style={{
        fontSize: 11,
        padding: '3px 8px',
        borderRadius: 4,
        background: isReady ? 'rgba(122, 139, 92, 0.1)' : 'rgba(184, 175, 166, 0.15)',
        color: isReady ? 'var(--color-olive)' : 'var(--text-tertiary)',
        fontWeight: 500,
      }}
    >
      {isReady ? '\u2713' : '\u2013'} {label}
    </span>
  );
}
