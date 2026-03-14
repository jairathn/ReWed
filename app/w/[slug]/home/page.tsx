'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';
import TravelListView from '@/components/travel/TravelListView';

interface FeedPost {
  id: string;
  type: 'text' | 'photo' | 'memory';
  content: string | null;
  photo_url: string | null;
  like_count: number;
  comment_count: number;
  is_pinned: boolean;
  is_liked: boolean;
  guest: {
    id: string;
    first_name: string;
    last_name: string;
    display_name: string;
  };
  created_at: string;
}

export default function GuestHomePage() {
  const { config, guest, slug, isAuthenticated, isLoading, configError, retryConfig, logout } = useWedding();
  const router = useRouter();
  const [hasPlan, setHasPlan] = useState<boolean | null>(null);

  // Feed state
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  // Check travel plan
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch(`/api/v1/w/${slug}/travel/my-plan`)
      .then((res) => res.json())
      .then((data) => setHasPlan(!!data.data?.plan))
      .catch(() => setHasPlan(false));
  }, [slug, isAuthenticated]);

  // Fetch feed
  const fetchPosts = useCallback(
    async (cursor?: string | null) => {
      try {
        const params = new URLSearchParams({ limit: '10' });
        if (cursor) params.set('cursor', cursor);
        const res = await fetch(`/api/v1/w/${slug}/feed?${params.toString()}`);
        const data = await res.json();
        if (data.data) {
          if (cursor) {
            setPosts((prev) => [...prev, ...data.data.items]);
          } else {
            setPosts(data.data.items);
          }
          setNextCursor(data.data.next_cursor);
        }
      } catch (err) {
        console.error('Failed to fetch feed:', err);
      }
    },
    [slug]
  );

  useEffect(() => {
    if (!guest) return;
    setLoadingPosts(true);
    fetchPosts().finally(() => setLoadingPosts(false));
  }, [guest, fetchPosts]);

  const handleLike = async (postId: string) => {
    try {
      const res = await fetch(`/api/v1/w/${slug}/feed/${postId}/like`, { method: 'POST' });
      const data = await res.json();
      if (data.data) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, is_liked: data.data.liked, like_count: data.data.like_count }
              : p
          )
        );
      }
    } catch (err) {
      console.error('Failed to toggle like:', err);
    }
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await fetchPosts(nextCursor);
    setLoadingMore(false);
  };

  // Calculate days until wedding
  const daysToGo = useMemo(() => {
    if (!config?.wedding_date) return null;
    const tz = config.timezone || 'America/New_York';
    const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const todayStr = `${nowInTz.getFullYear()}-${String(nowInTz.getMonth() + 1).padStart(2, '0')}-${String(nowInTz.getDate()).padStart(2, '0')}`;
    const todayMs = new Date(todayStr).getTime();
    const weddingMs = new Date(config.wedding_date).getTime();
    return Math.max(0, Math.ceil((weddingMs - todayMs) / (1000 * 60 * 60 * 24)));
  }, [config]);

  if (configError && !isLoading) {
    return (
      <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
        <div className="card p-8 text-center mt-12">
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Couldn&apos;t load the wedding. Check your connection and try again.
          </p>
          <button
            onClick={retryConfig}
            className="px-6 py-2.5 rounded-full text-sm font-medium text-white"
            style={{ background: 'var(--color-terracotta-gradient)' }}
          >
            Retry
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  if (isLoading || !config || !guest) {
    return (
      <div className="pb-24 px-5 pt-8">
        <div className="skeleton h-8 w-48 mb-2" />
        <div className="skeleton h-5 w-32 mb-6" />
        <div className="skeleton h-40 w-full mb-4 rounded-2xl" />
        <div className="skeleton h-32 w-full rounded-2xl" />
        <BottomNav />
      </div>
    );
  }

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  };

  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  const getAvatarColor = (name: string) => {
    const colors = ['#C4704B', '#2B5F8A', '#7A8B5C', '#D4A853', '#E8865A'];
    const index = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  return (
    <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
      {/* Welcome */}
      <div className="flex items-baseline justify-between mb-1">
        <h1
          className="text-2xl font-medium"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
        >
          Welcome back, {guest.first_name}
        </h1>
        <button
          onClick={logout}
          className="text-xs underline"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Not you?
        </button>
      </div>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        {config.display_name}
        {daysToGo !== null && ` \u2022 ${daysToGo} days to go`}
      </p>

      {/* Quick Links */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <Link href={`/w/${slug}/schedule`} className="card p-3 text-center">
          <div className="text-xl mb-1">&#128197;</div>
          <p className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>Schedule</p>
        </Link>
        <Link href={`/w/${slug}/directory`} className="card p-3 text-center">
          <div className="text-xl mb-1">&#128101;</div>
          <p className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>Guests</p>
        </Link>
        <Link href={`/w/${slug}/gallery`} className="card p-3 text-center">
          <div className="text-xl mb-1">&#128247;</div>
          <p className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>Gallery</p>
        </Link>
        <Link href={`/w/${slug}/faq`} className="card p-3 text-center">
          <div className="text-xl mb-1">&#129302;</div>
          <p className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>FAQ</p>
        </Link>
      </div>

      {/* Travel Section */}
      <TravelListView
        slug={slug}
        hasPlan={hasPlan}
        onAddPlan={() => router.push(`/w/${slug}/travel`)}
      />

      {/* Social Feed */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2
            className="text-base font-medium"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Social Feed
          </h2>
          <Link
            href={`/w/${slug}/feed`}
            className="text-xs font-medium"
            style={{ color: 'var(--color-terracotta)' }}
          >
            View all &rarr;
          </Link>
        </div>

        {loadingPosts ? (
          <div className="space-y-3">
            <div className="skeleton h-20 w-full rounded-xl" />
            <div className="skeleton h-20 w-full rounded-xl" />
          </div>
        ) : posts.length === 0 ? (
          <div
            className="card p-5 text-center"
            style={{ background: 'var(--bg-muted, #f9f8f6)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No posts yet. <Link href={`/w/${slug}/feed`} className="underline" style={{ color: 'var(--color-terracotta)' }}>Be the first to share!</Link>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.slice(0, 5).map((post) => (
              <div
                key={post.id}
                className="rounded-xl p-3"
                style={{
                  background: 'var(--bg-pure-white)',
                  border: post.is_pinned ? '1px solid var(--color-golden)' : '1px solid var(--border-light)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                    style={{ background: getAvatarColor(post.guest.display_name) }}
                  >
                    {getInitials(post.guest.display_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {post.guest.display_name}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                      {formatTimeAgo(post.created_at)}
                      {post.type === 'memory' && ' \u00b7 Memory'}
                    </p>
                  </div>
                </div>
                {post.content && (
                  <p
                    className="text-sm line-clamp-2"
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: post.type === 'memory' ? 'var(--font-display)' : 'var(--font-body)',
                      fontStyle: post.type === 'memory' ? 'italic' : 'normal',
                    }}
                  >
                    {post.content}
                  </p>
                )}
                {post.photo_url && (
                  <div className="rounded-lg overflow-hidden mt-2 max-h-32">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={post.photo_url} alt="" className="w-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={() => handleLike(post.id)}
                    className="flex items-center gap-1 text-xs"
                    style={{ color: post.is_liked ? '#E53E3E' : 'var(--text-tertiary)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill={post.is_liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                    {post.like_count > 0 && post.like_count}
                  </button>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {post.comment_count > 0 && `${post.comment_count} comments`}
                  </span>
                </div>
              </div>
            ))}

            {posts.length > 5 && (
              <Link
                href={`/w/${slug}/feed`}
                className="block text-center py-2 text-sm font-medium"
                style={{ color: 'var(--color-terracotta)' }}
              >
                See all posts &rarr;
              </Link>
            )}
          </div>
        )}
      </section>

      <BottomNav />
    </div>
  );
}
