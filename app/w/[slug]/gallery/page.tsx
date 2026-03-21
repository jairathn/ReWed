'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { MediaItem } from '@/lib/types/api';

type FilterTab = 'all' | 'photo' | 'video' | 'portrait' | 'favorite';

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

  if (isLoading || !guest) {
    return (
      <div className="pb-24 px-5 pt-8">
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
    { id: 'favorite', label: 'Favorites' },
  ];

  return (
    <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
      <BackButton href={`/w/${slug}/home`} label="Home" />
      <h1
        className="text-2xl font-medium mb-2"
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--text-primary)',
        }}
      >
        My Memories
      </h1>

      {/* Stats Row */}
      <div className="flex gap-4 mb-6">
        {[
          { label: 'Photos', count: counts.photos },
          { label: 'Videos', count: counts.videos },
          { label: 'Portraits', count: counts.portraits },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <p
              className="text-lg font-semibold"
              style={{ color: 'var(--color-terracotta)' }}
            >
              {stat.count}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors"
            style={{
              background:
                activeTab === tab.id ? 'var(--color-terracotta)' : 'transparent',
              color: activeTab === tab.id ? 'white' : 'var(--text-secondary)',
              border:
                activeTab === tab.id
                  ? 'none'
                  : '1px solid var(--border-light)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Media Grid */}
      {loadingMedia ? (
        <div className="grid grid-cols-3 gap-[3px]">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton aspect-square" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">&#128247;</p>
          <p
            className="text-lg font-medium mb-2"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            {activeTab === 'favorite' ? 'No favorites yet' : 'No memories yet'}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {activeTab === 'favorite'
              ? 'Tap the heart on any photo to save it here!'
              : 'Take a photo or record a video to start building your gallery!'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-[3px]">
            {items.map((item) => (
              <div
                key={item.id}
                className="aspect-square relative overflow-hidden rounded-sm cursor-pointer"
                style={{ background: 'var(--bg-soft-cream)' }}
                onClick={() => { setSelectedItem(item); setShowDeleteConfirm(false); }}
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

                {/* Favorite indicator */}
                {item.favorited && (
                  <div className="absolute top-1 left-1 text-red-500 text-sm drop-shadow">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </div>
                )}

                {/* Video duration badge */}
                {item.type === 'video' && item.duration_ms && (
                  <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {Math.floor(item.duration_ms / 60000)}:
                    {String(Math.floor((item.duration_ms % 60000) / 1000)).padStart(2, '0')}
                  </div>
                )}

                {/* Video play icon */}
                {item.type === 'video' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 bg-white/80 rounded-full flex items-center justify-center">
                      <svg width="12" height="14" viewBox="0 0 12 14" fill="var(--text-primary)">
                        <polygon points="0,0 12,7 0,14" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Portrait badge */}
                {item.type === 'portrait' && (
                  <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                    AI
                  </div>
                )}

                {/* Event badge */}
                {item.event_name && (
                  <div className="absolute top-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded max-w-[80px] truncate">
                    {item.event_name}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Load More */}
          {nextCursor && (
            <div className="text-center mt-6">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2 rounded-full text-sm font-medium transition-colors"
                style={{
                  background: 'rgba(196, 112, 75, 0.08)',
                  color: 'var(--color-terracotta)',
                }}
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Lightbox Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgba(0,0,0,0.92)' }}
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
            {/* Favorite */}
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

            {/* Download */}
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

            {/* Delete */}
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

      <BottomNav />
    </div>
  );
}
