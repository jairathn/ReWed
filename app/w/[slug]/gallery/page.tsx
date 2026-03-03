'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { MediaItem } from '@/lib/types/api';

type FilterTab = 'all' | 'photo' | 'video' | 'portrait';

export default function GalleryPage() {
  const { guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [counts, setCounts] = useState({ photos: 0, videos: 0, portraits: 0 });

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
  ];

  return (
    <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
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
            No memories yet
          </p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Take a photo or record a video to start building your gallery!
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-[3px]">
            {items.map((item) => (
              <div
                key={item.id}
                className="aspect-square relative overflow-hidden rounded-sm"
                style={{ background: 'var(--bg-soft-cream)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.thumbnail_url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />

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

      <BottomNav />
    </div>
  );
}
