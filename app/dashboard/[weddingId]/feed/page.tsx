'use client';

import { useState, useEffect, use } from 'react';

interface FeedPost {
  id: string;
  type: 'text' | 'photo' | 'memory';
  content: string | null;
  like_count: number;
  comment_count: number;
  is_pinned: boolean;
  is_hidden: boolean;
  created_at: string;
  guest_name?: string;
}

export default function FeedModerationPage({ params }: { params: Promise<{ weddingId: string }> }) {
  const { weddingId } = use(params);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch feed posts through overview endpoint for basic stats
    fetch(`/api/v1/dashboard/weddings/${weddingId}/overview`)
      .then((res) => res.json())
      .then((data) => {
        // We don't have a dedicated dashboard feed API yet, just show stats
        setPosts([]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [weddingId]);

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
        Social Feed
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
        Monitor and moderate guest posts on the social feed.
      </p>

      {loading ? (
        <div className="card p-6">
          <div className="skeleton" style={{ width: '100%', height: 200 }} />
        </div>
      ) : (
        <div className="card" style={{ padding: 48, textAlign: 'center', background: 'var(--bg-pure-white)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px' }}>
            <path d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-primary)', marginBottom: 8 }}>Feed Moderation</h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 400, margin: '0 auto' }}>
            Guest posts will appear here once guests start using the social feed. You can pin, hide, or manage posts from this page.
          </p>
        </div>
      )}
    </div>
  );
}
