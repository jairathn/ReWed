'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type FilterTab = 'all' | 'photo' | 'video';

interface SharedMediaItem {
  id: string;
  type: 'photo' | 'video';
  url: string;
  thumbnail_url: string;
  duration_ms: number | null;
  guest: {
    id: string;
    first_name: string;
    display_name: string | null;
  };
  created_at: string;
}

const getAvatarColor = (name: string) => {
  const colors = ['#C4704B', '#2B5F8A', '#7A8B5C', '#D4A853', '#E8865A'];
  const index = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
  return colors[index];
};

export default function SharedGalleryPage() {
  const { guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [items, setItems] = useState<SharedMediaItem[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedItem, setSelectedItem] = useState<SharedMediaItem | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
          `/api/v1/w/${slug}/shared-gallery?${params.toString()}`
        );
        const data = await res.json();

        if (data.data) {
          if (cursor) {
            setItems((prev) => [...prev, ...data.data.items]);
          } else {
            setItems(data.data.items);
          }
          setNextCursor(data.data.next_cursor);
          setTotalCount(data.data.total_count);
        }
      } catch (err) {
        console.error('Failed to fetch shared gallery:', err);
      }
    },
    [guest, slug]
  );

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

  const handleDownload = async (item: SharedMediaItem) => {
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

  if (isLoading || !guest) {
    return (
      <div className="min-h-screen flex flex-col">
        <header
          className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
          style={{
            background: 'linear-gradient(to bottom, rgba(250, 249, 245, 0.88) 0%, rgba(250, 249, 245, 0.5) 55%, rgba(250, 249, 245, 0) 100%)',
          }}
        >
          <div className="flex items-center gap-3">
            <BackButton href={`/w/${slug}/home`} label="" />
          </div>
          <h1
            className="text-2xl tracking-wide"
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              color: 'var(--color-gold-dark)',
            }}
          >
            ReWed
          </h1>
          <div className="w-8" />
        </header>
        <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1">
          <section className="mb-6 text-center">
            <div className="skeleton h-12 w-48 mx-auto mb-3" />
            <div className="skeleton h-5 w-64 mx-auto" />
          </section>
          <div className="grid grid-cols-3 gap-[3px]">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="skeleton aspect-square" />
            ))}
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'photo', label: 'Photos' },
    { id: 'video', label: 'Videos' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
        style={{
          background: 'linear-gradient(to bottom, rgba(250, 249, 245, 0.88) 0%, rgba(250, 249, 245, 0.5) 55%, rgba(250, 249, 245, 0) 100%)',
        }}
      >
        <div className="flex items-center gap-3">
          <BackButton href={`/w/${slug}/home`} label="" />
        </div>
        <h1
          className="text-2xl tracking-wide"
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            color: 'var(--color-gold-dark)',
          }}
        >
          ReWed
        </h1>
        <div className="w-8" />
      </header>
      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1">

      <section className="mb-6 text-center">
        <h2
          className="text-5xl mb-3 tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)',
          }}
        >
          Memories
        </h2>
        <div className="flex items-center justify-center gap-3">
          <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
          <p
            className="text-lg"
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              color: 'var(--color-terracotta)',
            }}
          >
            {totalCount} shots from everyone
          </p>
          <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
        </div>
      </section>

      {/* Filter Tabs */}
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
            Nothing here yet — be the first!
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
            Open the camera
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-[2px] mt-5">
            {items.map((item, i) => {
              const guestName = item.guest.display_name || item.guest.first_name;
              return (
                <div
                  key={item.id}
                  className="aspect-square relative overflow-hidden cursor-pointer group"
                  style={{
                    background: 'var(--bg-soft-cream)',
                    borderRadius: i === 0 ? '10px 2px 2px 2px' : i === 2 ? '2px 10px 2px 2px' : 2,
                    ...(i === 0 ? { gridColumn: 'span 2', gridRow: 'span 2' } : {}),
                  }}
                  onClick={() => setSelectedItem(item)}
                >
                  {item.type === 'video' ? (
                    <video
                      src={`${item.url}#t=0.1`}
                      className="w-full h-full object-cover"
                      preload="metadata"
                      muted
                      playsInline
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
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
                  )}

                  {/* Gradient overlay at bottom */}
                  <div
                    className="absolute inset-x-0 bottom-0 pointer-events-none"
                    style={{
                      height: '40%',
                      background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)',
                    }}
                  />

                  {/* Guest avatar + name badge */}
                  <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 pointer-events-none">
                    <div
                      className="flex items-center justify-center rounded-full text-white font-medium"
                      style={{
                        width: i === 0 ? 22 : 18,
                        height: i === 0 ? 22 : 18,
                        fontSize: i === 0 ? 10 : 8,
                        backgroundColor: getAvatarColor(guestName),
                        flexShrink: 0,
                      }}
                    >
                      {guestName.charAt(0).toUpperCase()}
                    </div>
                    <span
                      className="text-white font-medium truncate"
                      style={{
                        fontSize: i === 0 ? 11 : 9,
                        textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                        maxWidth: i === 0 ? 120 : 60,
                      }}
                    >
                      {item.guest.first_name}
                    </span>
                  </div>

                  {/* Hero image gold corner accent */}
                  {i === 0 && (
                    <>
                      <div className="absolute top-0 left-0 w-10" style={{ height: 1, background: 'linear-gradient(90deg, var(--color-gold), transparent)', opacity: 0.4 }} />
                      <div className="absolute top-0 left-0 h-10" style={{ width: 1, background: 'linear-gradient(180deg, var(--color-gold), transparent)', opacity: 0.4 }} />
                    </>
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
        </>
      )}

      {/* Lightbox Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 flex flex-col"
          style={{ background: 'rgba(0,0,0,0.92)', zIndex: 60 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
            <button
              onClick={() => setSelectedItem(null)}
              className="text-white p-2"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center rounded-full text-white font-medium"
                style={{
                  width: 24,
                  height: 24,
                  fontSize: 11,
                  backgroundColor: getAvatarColor(
                    selectedItem.guest.display_name || selectedItem.guest.first_name
                  ),
                }}
              >
                {(selectedItem.guest.display_name || selectedItem.guest.first_name)
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <span className="text-white/70 text-sm">
                {selectedItem.guest.first_name}
              </span>
            </div>
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
          </div>
        </div>
      )}

      </main>
      <BottomNav />
    </div>
  );
}
