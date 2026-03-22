'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { MediaItem } from '@/lib/types/api';

type FilterTab = 'all' | 'photo' | 'video' | 'portrait' | 'favorite';

const AI_STYLES: { id: string; name: string; emoji: string }[] = [
  { id: 'castle-wedding', name: 'Castle Wedding', emoji: '🏰' },
  { id: 'mughal', name: 'Mughal Royalty', emoji: '👑' },
  { id: 'bollywood-poster', name: 'Bollywood Poster', emoji: '🎬' },
  { id: 'watercolor', name: 'Watercolor', emoji: '🎨' },
  { id: 'renaissance', name: 'Renaissance', emoji: '🖼️' },
  { id: 'pop-art', name: 'Pop Art', emoji: '🎯' },
  { id: 'anime', name: 'Anime', emoji: '✨' },
  { id: 'oil-painting', name: 'Oil Painting', emoji: '🖌️' },
  { id: 'pixel-art', name: 'Pixel Art', emoji: '👾' },
  { id: 'stained-glass', name: 'Stained Glass', emoji: '⛪' },
];

export default function GalleryPage() {
  const { guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [counts, setCounts] = useState({ photos: 0, videos: 0, portraits: 0 });
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeThumbId, setActiveThumbId] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiSourceItem, setAiSourceItem] = useState<MediaItem | null>(null);
  const [selectedAiStyle, setSelectedAiStyle] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiCustomPrompt, setAiCustomPrompt] = useState('');
  const [aiMode, setAiMode] = useState<'presets' | 'custom'>('presets');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  const fetchMedia = useCallback(
    async (tab: FilterTab, cursor?: string | null) => {
      if (!guest) return;

      const params = new URLSearchParams();
      if (tab !== 'all') params.set('type', tab);
      if (cursor) params.set('cursor', cursor);
      params.set('limit', '30');

      try {
        const res = await fetch(
          `/api/v1/w/${slug}/media/${guest.id}?${params.toString()}`
        );
        const data = await res.json();

        if (data.data) {
          if (cursor) {
            setItems((prev) => [...prev, ...data.data.items]);
          } else {
            setItems(data.data.items);
          }
          setNextCursor(data.data.next_cursor);
        }
      } catch (err) {
        console.error('Failed to fetch media:', err);
      }
    },
    [guest, slug]
  );

  // Fetch counts on mount
  useEffect(() => {
    if (!guest) return;

    const fetchCounts = async () => {
      try {
        const [photos, videos, portraits] = await Promise.all(
          ['photo', 'video', 'portrait'].map(async (type) => {
            const res = await fetch(
              `/api/v1/w/${slug}/media/${guest.id}?type=${type}&limit=1`
            );
            const data = await res.json();
            return data.data?.items?.length || 0;
          })
        );
        setCounts({ photos, videos, portraits });
      } catch {
        // Counts are best-effort
      }
    };

    fetchCounts();
  }, [guest, slug]);

  // Fetch media when tab changes
  useEffect(() => {
    if (!guest) return;
    setLoadingMedia(true);
    fetchMedia(activeTab).finally(() => setLoadingMedia(false));
  }, [activeTab, guest, fetchMedia]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await fetchMedia(activeTab, nextCursor);
    setLoadingMore(false);
  };

  const handleFavorite = async (item: MediaItem) => {
    setActionLoading('favorite');
    try {
      const res = await fetch(`/api/v1/w/${slug}/upload/${item.id}/favorite`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.data) {
        const newFavorited = data.data.favorited;
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, favorited: newFavorited } : i))
        );
        setSelectedItem((prev) => prev && prev.id === item.id ? { ...prev, favorited: newFavorited } : prev);
      }
    } catch {
      // Silently fail
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownload = async (item: MediaItem) => {
    setActionLoading('download');
    try {
      const res = await fetch(`/api/v1/w/${slug}/upload/${item.id}/download`);
      const data = await res.json();
      if (data.data?.download_url) {
        const a = document.createElement('a');
        a.href = data.data.download_url;
        a.download = '';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      // Silently fail
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (item: MediaItem) => {
    setActionLoading('delete');
    try {
      const res = await fetch(`/api/v1/w/${slug}/upload/${item.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.data?.deleted) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setSelectedItem(null);
        setShowDeleteConfirm(false);
      }
    } catch {
      // Silently fail
    } finally {
      setActionLoading(null);
    }
  };

  const handleAiPortrait = async () => {
    if (!aiSourceItem || (!selectedAiStyle && !aiCustomPrompt.trim())) return;
    setAiGenerating(true);
    try {
      const res = await fetch(`/api/v1/w/${slug}/ai-portrait`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_upload_id: aiSourceItem.id,
          style_id: selectedAiStyle || 'custom',
          custom_prompt: aiCustomPrompt.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowAiModal(false);
        setAiSourceItem(null);
        setSelectedAiStyle(null);
        setAiCustomPrompt('');
        // Show toast-like feedback
        alert('AI portrait is generating! It will appear in your gallery shortly.');
      } else {
        alert(data.error?.message || 'Failed to generate portrait');
      }
    } catch {
      alert('Failed to generate portrait. Please try again.');
    } finally {
      setAiGenerating(false);
    }
  };

  if (isLoading || !guest) {
    return (
      <div className="pb-24 px-7 pt-8">
        <div className="skeleton h-8 w-40 mb-6" />
        <div className="grid grid-cols-3 gap-[3px]">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton aspect-square" />
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'photo', label: 'Photos' },
    { id: 'video', label: 'Videos' },
    { id: 'portrait', label: 'Portraits' },
  ];

  return (
    <div className="pb-24 px-7 pt-8 max-w-lg mx-auto">
      <BackButton href={`/w/${slug}/home`} label="Home" />

      <h1
        className="text-[32px] font-normal mb-1"
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)',
          letterSpacing: '-0.01em',
        }}
      >
        My Memories
      </h1>

      {/* Gold divider */}
      <div className="gold-divider" style={{ margin: '12px 0 20px' }} />

      {/* Stats Row — shimmer gold numbers */}
      <div className="flex gap-6 mb-6">
        {[
          { n: counts.photos, l: 'Photos' },
          { n: counts.videos, l: 'Videos' },
          { n: counts.portraits, l: 'Portraits' },
        ].map((s) => (
          <div key={s.l}>
            <span
              className="shimmer-text"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 26,
                fontWeight: 400,
                display: 'inline-block',
              }}
            >
              {s.n}
            </span>
            <span className="text-[11px] ml-1.5" style={{ color: 'var(--text-secondary)' }}>
              {s.l}
            </span>
          </div>
        ))}
      </div>

      {/* Filter Tabs — underline style */}
      <div
        className="flex -mx-7 px-7"
        style={{ borderBottom: '0.5px solid var(--border-light)' }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="text-[11px] font-medium uppercase tracking-wide whitespace-nowrap transition-colors"
            style={{
              padding: '12px 20px',
              color: activeTab === tab.id ? 'var(--color-gold)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab.id ? '1.5px solid var(--color-gold)' : '1.5px solid transparent',
              marginBottom: '-0.5px',
              background: 'none',
              border: 'none',
              borderBottomWidth: '1.5px',
              borderBottomStyle: 'solid',
              borderBottomColor: activeTab === tab.id ? 'var(--color-gold)' : 'transparent',
              cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Media Grid */}
      {loadingMedia ? (
        <div className="grid grid-cols-3 gap-[2px] mt-5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton aspect-square" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p
            className="text-lg font-normal mb-2"
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              color: 'var(--text-secondary)',
            }}
          >
            {activeTab === 'favorite' ? 'No favorites yet' : 'Capture more moments'}
          </p>
          <button
            onClick={() => router.push(`/w/${slug}/capture`)}
            className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide mt-4"
            style={{
              padding: '12px 28px',
              background: 'transparent',
              border: '0.5px solid var(--color-gold-rule)',
              color: 'var(--color-gold)',
              borderRadius: 50,
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            Open Camera
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-[2px] mt-5">
            {items.map((item, i) => {
              const showActions = activeThumbId === item.id;
              return (
                <div
                  key={item.id}
                  className="aspect-square relative overflow-hidden cursor-pointer group"
                  style={{
                    background: 'var(--bg-soft-cream)',
                    borderRadius: i === 0 ? '10px 2px 2px 2px' : i === 2 ? '2px 10px 2px 2px' : 2,
                    ...(i === 0 ? { gridColumn: 'span 2', gridRow: 'span 2' } : {}),
                  }}
                  onClick={() => {
                    // On mobile: first tap shows actions, second tap opens lightbox
                    if ('ontouchstart' in window) {
                      if (activeThumbId === item.id) {
                        setSelectedItem(item);
                        setShowDeleteConfirm(false);
                        setActiveThumbId(null);
                      } else {
                        setActiveThumbId(item.id);
                      }
                    } else {
                      setSelectedItem(item);
                      setShowDeleteConfirm(false);
                    }
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.thumbnail_url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (img.src !== item.url) {
                        img.src = item.url;
                      }
                    }}
                  />

                  {/* Action overlay - shown on hover (desktop) or tap (mobile) */}
                  <div
                    className={`absolute inset-0 flex items-end justify-center gap-3 pb-2 transition-opacity duration-200 ${showActions ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    style={{
                      background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)',
                    }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); handleFavorite(item); }}
                      className="p-1.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
                      title={item.favorited ? 'Unsave' : 'Save'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24"
                        fill={item.favorited ? '#ef4444' : 'none'}
                        stroke={item.favorited ? '#ef4444' : 'white'}
                        strokeWidth="2"
                      >
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(item); }}
                      className="p-1.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
                      title="Download"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItem(item);
                        setShowDeleteConfirm(true);
                      }}
                      className="p-1.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
                      title="Delete"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </div>

                  {/* Hero image gold corner accent */}
                  {i === 0 && (
                    <>
                      <div className="absolute top-0 left-0 w-10" style={{ height: 1, background: 'linear-gradient(90deg, var(--color-gold), transparent)', opacity: 0.4 }} />
                      <div className="absolute top-0 left-0 h-10" style={{ width: 1, background: 'linear-gradient(180deg, var(--color-gold), transparent)', opacity: 0.4 }} />
                    </>
                  )}

                  {/* Portrait badge */}
                  {item.type === 'portrait' && (
                    <div className="absolute bottom-3 left-3 pointer-events-none">
                      <div
                        className="text-[8.5px] font-medium uppercase tracking-wider"
                        style={{
                          padding: '4px 10px',
                          background: 'rgba(26, 23, 20, 0.55)',
                          backdropFilter: 'blur(12px)',
                          borderRadius: 4,
                          color: 'rgba(255, 255, 255, 0.85)',
                          letterSpacing: '0.1em',
                        }}
                      >
                        Portrait
                      </div>
                    </div>
                  )}

                  {/* Favorite indicator */}
                  {item.favorited && (
                    <div className="absolute top-1 left-1 text-red-500 text-sm drop-shadow pointer-events-none">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                    </div>
                  )}

                  {/* Video play icon */}
                  {item.type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ border: '1px solid rgba(255, 255, 255, 0.5)' }}
                      >
                        <div
                          style={{
                            width: 0, height: 0,
                            borderTop: '4px solid transparent',
                            borderBottom: '4px solid transparent',
                            borderLeft: '7px solid rgba(255, 255, 255, 0.7)',
                            marginLeft: 2,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Video duration badge */}
                  {item.type === 'video' && item.duration_ms && (
                    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
                      {Math.floor(item.duration_ms / 60000)}:
                      {String(Math.floor((item.duration_ms % 60000) / 1000)).padStart(2, '0')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Load More */}
          {nextCursor && (
            <div className="text-center mt-6">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2 rounded-full text-sm font-medium transition-colors"
                style={{
                  background: 'var(--color-gold-faint)',
                  color: 'var(--color-gold)',
                  border: '0.5px solid var(--color-gold-rule)',
                }}
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}

          {/* Capture CTA at bottom */}
          <div className="text-center mt-10">
            <p
              className="text-[15px] mb-5"
              style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--text-secondary)' }}
            >
              Capture more moments
            </p>
            <button
              onClick={() => router.push(`/w/${slug}/capture`)}
              className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide"
              style={{
                padding: '12px 28px',
                background: 'transparent',
                border: '0.5px solid var(--color-gold-rule)',
                color: 'var(--color-gold)',
                borderRadius: 50,
                cursor: 'pointer',
                letterSpacing: '0.04em',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              Open Camera
            </button>
          </div>
        </>
      )}

      {/* Lightbox Modal — z-[60] to sit above BottomNav z-50 */}
      {selectedItem && (
        <div
          className="fixed inset-0 flex flex-col"
          style={{ background: 'rgba(0,0,0,0.92)', zIndex: 60 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
            <button
              onClick={() => { setSelectedItem(null); setShowDeleteConfirm(false); }}
              className="text-white p-2"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            {selectedItem.event_name && (
              <span className="text-white/70 text-sm">{selectedItem.event_name}</span>
            )}
            <div className="w-10" />
          </div>

          {/* Image */}
          <div className="flex-1 flex items-center justify-center px-4 overflow-hidden">
            {selectedItem.type === 'video' ? (
              <video
                src={selectedItem.url}
                controls
                autoPlay
                className="max-w-full max-h-full rounded-lg"
                style={{ objectFit: 'contain' }}
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={selectedItem.url}
                alt=""
                className="max-w-full max-h-full rounded-lg"
                style={{ objectFit: 'contain' }}
              />
            )}
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-center gap-8 px-4 py-5 flex-shrink-0">
            <button
              onClick={() => handleFavorite(selectedItem)}
              disabled={actionLoading === 'favorite'}
              className="flex flex-col items-center gap-1"
            >
              <svg width="26" height="26" viewBox="0 0 24 24"
                fill={selectedItem.favorited ? '#ef4444' : 'none'}
                stroke={selectedItem.favorited ? '#ef4444' : 'white'}
                strokeWidth="2"
              >
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
              <span className="text-white/70 text-[11px]">
                {selectedItem.favorited ? 'Saved' : 'Save'}
              </span>
            </button>

            <button
              onClick={() => handleDownload(selectedItem)}
              disabled={actionLoading === 'download'}
              className="flex flex-col items-center gap-1"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className="text-white/70 text-[11px]">Download</span>
            </button>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={actionLoading === 'delete'}
              className="flex flex-col items-center gap-1"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              <span className="text-white/70 text-[11px]">Delete</span>
            </button>

            {selectedItem.type === 'photo' && (
              <button
                onClick={() => {
                  setAiSourceItem(selectedItem);
                  setShowAiModal(true);
                  setSelectedItem(null);
                }}
                className="flex flex-col items-center gap-1"
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                <span className="text-white/70 text-[11px]">AI Edit</span>
              </button>
            )}
          </div>

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="absolute bottom-0 left-0 right-0 p-5 rounded-t-2xl"
              style={{ background: 'var(--bg-pure-white)' }}
            >
              <p className="text-center font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Delete this {selectedItem.type}?
              </p>
              <p className="text-center text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                This can&apos;t be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 rounded-full text-sm font-medium"
                  style={{ border: '1px solid var(--border-medium)', color: 'var(--text-primary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(selectedItem)}
                  disabled={actionLoading === 'delete'}
                  className="flex-1 py-3 rounded-full text-sm font-medium text-white"
                  style={{ background: '#ef4444' }}
                >
                  {actionLoading === 'delete' ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showAiModal && aiSourceItem && (
        <div className="fixed inset-0 flex flex-col" style={{ background: 'rgba(0,0,0,0.92)', zIndex: 65 }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
            <button onClick={() => { setShowAiModal(false); setSelectedAiStyle(null); setAiCustomPrompt(''); }} className="text-white p-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
            <span className="text-white text-sm font-medium" style={{ fontFamily: 'var(--font-display)' }}>Edit with AI</span>
            <div className="w-10" />
          </div>

          {/* Source image preview */}
          <div className="px-4 flex justify-center mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={aiSourceItem.thumbnail_url} alt="" className="w-32 h-32 rounded-xl object-cover" style={{ border: '2px solid rgba(255,255,255,0.2)' }} />
          </div>

          {/* Mode toggle */}
          <div className="flex justify-center gap-2 mb-4 px-4">
            <button onClick={() => setAiMode('presets')} className="px-4 py-1.5 rounded-full text-xs font-medium" style={{ background: aiMode === 'presets' ? 'var(--color-terracotta)' : 'rgba(255,255,255,0.1)', color: 'white' }}>Preset Styles</button>
            <button onClick={() => setAiMode('custom')} className="px-4 py-1.5 rounded-full text-xs font-medium" style={{ background: aiMode === 'custom' ? 'var(--color-terracotta)' : 'rgba(255,255,255,0.1)', color: 'white' }}>Custom Prompt</button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-4">
            {aiMode === 'presets' ? (
              <div className="grid grid-cols-3 gap-3">
                {AI_STYLES.map((style) => (
                  <button key={style.id} onClick={() => { setSelectedAiStyle(style.id); setAiCustomPrompt(''); }} className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all" style={{ background: selectedAiStyle === style.id ? 'rgba(196,112,75,0.4)' : 'rgba(254,252,249,0.06)', border: selectedAiStyle === style.id ? '2px solid var(--color-terracotta)' : '2px solid transparent' }}>
                    <span className="text-2xl">{style.emoji}</span>
                    <span className="text-xs font-medium text-center leading-tight" style={{ color: '#FEFCF9' }}>{style.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div>
                <p className="text-white/60 text-sm mb-3">Describe how you want your portrait to look:</p>
                <textarea value={aiCustomPrompt} onChange={(e) => { setAiCustomPrompt(e.target.value); setSelectedAiStyle(null); }} placeholder="e.g. Transform this into a Renaissance painting with golden light..." className="w-full p-3 rounded-xl text-sm resize-none" style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', minHeight: '100px', fontFamily: 'var(--font-body)' }} maxLength={500} />
                <p className="text-white/30 text-xs mt-1 text-right">{aiCustomPrompt.length}/500</p>
              </div>
            )}
          </div>

          {/* Generate button */}
          <div className="px-6 pb-10 pt-4 flex justify-center">
            <button onClick={handleAiPortrait} disabled={aiGenerating || (!selectedAiStyle && !aiCustomPrompt.trim())} className="w-full max-w-xs py-4 rounded-full text-base font-semibold transition-transform active:scale-95" style={{ background: (selectedAiStyle || aiCustomPrompt.trim()) ? 'var(--color-terracotta-gradient)' : 'rgba(255,255,255,0.1)', color: (selectedAiStyle || aiCustomPrompt.trim()) ? 'white' : 'rgba(255,255,255,0.3)', boxShadow: (selectedAiStyle || aiCustomPrompt.trim()) ? 'var(--shadow-terracotta)' : 'none' }}>
              {aiGenerating ? 'Generating...' : 'Generate Portrait'}
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
