'use client';

import { useState, useEffect, useCallback, use } from 'react';
import PasswordConfirmDialog from '@/components/ui/PasswordConfirmDialog';

interface FeedPost {
  id: string;
  type: 'text' | 'photo' | 'memory';
  content: string | null;
  photo_url: string | null;
  like_count: number;
  comment_count: number;
  is_pinned: boolean;
  is_hidden: boolean;
  created_at: string;
  guest: {
    id: string;
    display_name: string;
    first_name: string;
    last_name: string;
  };
}

export default function FeedModerationPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<'all' | 'visible' | 'hidden'>('all');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; author: string } | null>(null);

  const fetchPosts = useCallback(async (cursor?: string | null) => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/feed?${params.toString()}`);
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
    } finally {
      setLoading(false);
    }
  }, [weddingId]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleAction = async (postId: string, action: string) => {
    try {
      const res = await fetch(`/api/v1/dashboard/weddings/${weddingId}/feed`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, action }),
      });
      if (res.ok) {
        if (action === 'delete') {
          setPosts((prev) => prev.filter((p) => p.id !== postId));
        } else {
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== postId) return p;
              switch (action) {
                case 'pin': return { ...p, is_pinned: true };
                case 'unpin': return { ...p, is_pinned: false };
                case 'hide': return { ...p, is_hidden: true };
                case 'unhide': return { ...p, is_hidden: false };
                default: return p;
              }
            })
          );
        }
      }
    } catch (err) {
      console.error('Action failed:', err);
    }
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await fetchPosts(nextCursor);
    setLoadingMore(false);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const getInitials = (name: string) =>
    name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  const getAvatarColor = (name: string) => {
    const colors = ['#C4704B', '#2B5F8A', '#7A8B5C', '#D4A853', '#E8865A'];
    const index = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  const filtered = posts.filter((p) => {
    if (filter === 'visible') return !p.is_hidden;
    if (filter === 'hidden') return p.is_hidden;
    return true;
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
            Social Feed
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', marginTop: 4 }}>
            Monitor and moderate guest posts on the social feed.
          </p>
        </div>
        {posts.length > 0 && (
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'visible', 'hidden'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: 'var(--font-body)',
                  background: filter === f ? 'var(--color-terracotta)' : 'transparent',
                  color: filter === f ? 'white' : 'var(--text-secondary)',
                  border: filter === f ? 'none' : '1px solid var(--border-light)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {f} {f === 'all' ? `(${posts.length})` : f === 'hidden' ? `(${posts.filter((p) => p.is_hidden).length})` : `(${posts.filter((p) => !p.is_hidden).length})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ borderRadius: 16, background: 'var(--bg-pure-white)', border: '1px solid var(--border-light)', padding: 24 }}>
          <div className="skeleton" style={{ width: '100%', height: 200 }} />
        </div>
      ) : posts.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', background: 'var(--bg-pure-white)', borderRadius: 16, border: '1px solid var(--border-light)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px' }}>
            <path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>No posts yet</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto' }}>
            Guest posts will appear here once guests start using the social feed. Share your QR code to get them started!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((post) => (
            <div
              key={post.id}
              style={{
                padding: 20,
                background: 'var(--bg-pure-white)',
                borderRadius: 16,
                border: post.is_pinned ? '1.5px solid var(--color-golden)' : '1px solid var(--border-light)',
                opacity: post.is_hidden ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', gap: 14 }}>
                {/* Avatar */}
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: getAvatarColor(post.guest.display_name),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {getInitials(post.guest.display_name)}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {post.guest.display_name}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {formatTime(post.created_at)}
                    </span>
                    {post.is_pinned && (
                      <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 999, background: 'rgba(212, 168, 83, 0.12)', color: 'var(--color-golden)', fontWeight: 500 }}>
                        Pinned
                      </span>
                    )}
                    {post.is_hidden && (
                      <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 999, background: 'rgba(196, 112, 75, 0.08)', color: 'var(--color-terracotta)', fontWeight: 500 }}>
                        Hidden
                      </span>
                    )}
                    {post.type === 'memory' && (
                      <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 999, background: 'rgba(43, 95, 138, 0.08)', color: 'var(--color-mediterranean-blue)', fontWeight: 500 }}>
                        Memory
                      </span>
                    )}
                  </div>

                  {post.content && (
                    <p style={{
                      fontSize: 14,
                      color: 'var(--text-primary)',
                      margin: '0 0 8px',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      fontFamily: post.type === 'memory' ? 'var(--font-display)' : 'var(--font-body)',
                      fontStyle: post.type === 'memory' ? 'italic' : 'normal',
                    }}>
                      {post.content}
                    </p>
                  )}

                  {post.photo_url && (
                    <div style={{ marginBottom: 8 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={post.photo_url}
                        alt=""
                        style={{ maxHeight: 200, borderRadius: 12, objectFit: 'cover' }}
                        loading="lazy"
                      />
                    </div>
                  )}

                  {/* Stats + actions row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-tertiary)' }}>
                      <span>{post.like_count} like{post.like_count !== 1 ? 's' : ''}</span>
                      <span>{post.comment_count} comment{post.comment_count !== 1 ? 's' : ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => handleAction(post.id, post.is_pinned ? 'unpin' : 'pin')}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 12,
                          color: post.is_pinned ? 'var(--color-golden)' : 'var(--text-tertiary)',
                          fontFamily: 'var(--font-body)',
                          padding: '4px 8px',
                          borderRadius: 6,
                        }}
                        title={post.is_pinned ? 'Unpin post' : 'Pin post'}
                      >
                        {post.is_pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button
                        onClick={() => handleAction(post.id, post.is_hidden ? 'unhide' : 'hide')}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 12,
                          color: post.is_hidden ? 'var(--color-olive)' : 'var(--text-tertiary)',
                          fontFamily: 'var(--font-body)',
                          padding: '4px 8px',
                          borderRadius: 6,
                        }}
                        title={post.is_hidden ? 'Show post' : 'Hide post'}
                      >
                        {post.is_hidden ? 'Unhide' : 'Hide'}
                      </button>
                      <button
                        onClick={() =>
                          setConfirmDelete({ id: post.id, author: post.guest.display_name })
                        }
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 12,
                          color: 'var(--color-terracotta)',
                          fontFamily: 'var(--font-body)',
                          padding: '4px 8px',
                          borderRadius: 6,
                        }}
                        title="Delete post"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {nextCursor && (
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                style={{ fontSize: 13, border: '1px solid var(--border-light)', borderRadius: 10, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer', padding: '8px 16px' }}
              >
                {loadingMore ? 'Loading...' : 'Load more posts'}
              </button>
            </div>
          )}
        </div>
      )}

      <PasswordConfirmDialog
        open={confirmDelete !== null}
        title="Permanently delete this post?"
        description={
          confirmDelete ? (
            <>
              This will permanently remove <strong>{confirmDelete.author}</strong>&rsquo;s post from
              your social feed. If you only want to hide it, use Hide instead. This cannot be undone.
              Enter your password to confirm.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Delete post"
        onConfirm={async () => {
          if (confirmDelete) {
            await handleAction(confirmDelete.id, 'delete');
            setConfirmDelete(null);
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
