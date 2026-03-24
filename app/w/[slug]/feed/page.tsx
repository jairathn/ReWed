'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface FeedPost {
  id: string;
  type: 'text' | 'photo' | 'memory';
  content: string | null;
  photo_url: string | null;
  video_url: string | null;
  media_type: 'photo' | 'video' | null;
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

export default function FeedPage() {
  const { config, guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [composeType, setComposeType] = useState<'text' | 'memory'>('text');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, { id: string; content: string; guest: { display_name: string }; created_at: string }[]>>({});
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [feedBlocked, setFeedBlocked] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  const fetchPosts = useCallback(
    async (cursor?: string | null) => {
      try {
        const params = new URLSearchParams({ limit: '20' });
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
        // Check event-blocking status
        setFeedBlocked(data.is_blocked === true);
        if (data.blocked_message) {
          setBlockedMessage(data.blocked_message);
        }
      } catch (err) {
        console.error('Failed to fetch feed:', err);
        if (!cursor) setFetchError('Could not load feed. Pull down to retry.');
      }
    },
    [slug]
  );

  useEffect(() => {
    if (!guest) return;
    setLoadingPosts(true);
    fetchPosts().finally(() => setLoadingPosts(false));
  }, [guest, fetchPosts]);

  const handleMediaSelect = (file: File) => {
    // Validate type and size
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      setPostError('Please select a photo or video file.');
      return;
    }
    const maxSize = isVideo ? 500 * 1024 * 1024 : 25 * 1024 * 1024;
    if (file.size > maxSize) {
      setPostError(isVideo ? 'Video must be under 500MB.' : 'Photo must be under 25MB.');
      return;
    }
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    setPostError('');
  };

  const clearMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview('');
    setUploadProgress(0);
  };

  const uploadMedia = async (file: File): Promise<string | null> => {
    const isVideo = file.type.startsWith('video/');
    // Step 1: Presign
    const presignRes = await fetch(`/api/v1/w/${slug}/upload/presign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: isVideo ? 'video' : 'photo',
        mime_type: file.type,
        size_bytes: file.size,
      }),
    });
    if (!presignRes.ok) throw new Error('Failed to get upload URL');
    const { data: presignData } = await presignRes.json();
    setUploadProgress(15);

    // Step 2: Upload to presigned URL
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', presignData.presigned_url);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress(15 + Math.round((e.loaded / e.total) * 65));
        }
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Upload failed')));
      xhr.onerror = () => reject(new Error('Upload network error'));
      xhr.send(file);
    });
    setUploadProgress(85);

    // Step 3: Complete
    const completeRes = await fetch(`/api/v1/w/${slug}/upload/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_id: presignData.upload_id,
        storage_key: presignData.storage_key,
      }),
    });
    if (!completeRes.ok) throw new Error('Failed to complete upload');
    setUploadProgress(100);
    return presignData.upload_id;
  };

  const handlePost = async () => {
    if (!composeText.trim() && !mediaFile) return;
    if (posting) return;
    setPosting(true);
    setPostError('');

    try {
      let photoUploadId: string | null = null;

      // Upload media first if attached
      if (mediaFile) {
        photoUploadId = await uploadMedia(mediaFile);
      }

      const res = await fetch(`/api/v1/w/${slug}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: mediaFile ? 'photo' : composeType,
          content: composeText.trim() || undefined,
          photo_upload_id: photoUploadId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error?.code === 'FEED_BLOCKED') {
          setFeedBlocked(true);
          setBlockedMessage(data.error.message);
          setShowCompose(false);
        }
        setPostError(data.error?.message || 'Could not create post. Please try again.');
        return;
      }
      if (data.data?.post) {
        setPosts((prev) => [data.data.post, ...prev]);
        setComposeText('');
        clearMedia();
        setShowCompose(false);
        setPostError('');
      }
    } catch (err) {
      console.error('Failed to create post:', err);
      setPostError('Upload failed. Please try again.');
    } finally {
      setPosting(false);
      setUploadProgress(0);
    }
  };

  const handleLike = async (postId: string) => {
    try {
      const res = await fetch(`/api/v1/w/${slug}/feed/${postId}/like`, {
        method: 'POST',
      });
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

  const toggleComments = async (postId: string) => {
    if (expandedComments === postId) {
      setExpandedComments(null);
      return;
    }
    setExpandedComments(postId);
    setCommentText('');
    if (!comments[postId]) {
      try {
        const res = await fetch(`/api/v1/w/${slug}/feed/${postId}/comments`);
        const data = await res.json();
        if (data.data?.comments) {
          setComments((prev) => ({ ...prev, [postId]: data.data.comments }));
        }
      } catch (err) {
        console.error('Failed to fetch comments:', err);
      }
    }
  };

  const handleComment = async (postId: string) => {
    if (!commentText.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/v1/w/${slug}/feed/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      const data = await res.json();
      if (data.data?.comment) {
        setComments((prev) => ({
          ...prev,
          [postId]: [...(prev[postId] || []), data.data.comment],
        }));
        setCommentText('');
        setPosts((prev) =>
          prev.map((p) => p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p)
        );
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setPostingComment(false);
    }
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    await fetchPosts(nextCursor);
    setLoadingMore(false);
  };

  if (isLoading || !guest) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-warm-white)' }}>
        <header
          className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
          style={{
            background: 'rgba(250, 249, 245, 0.90)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
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
          <div className="skeleton h-8 w-32 mb-6" />
          <div className="skeleton h-24 w-full mb-3 rounded-xl" />
          <div className="skeleton h-24 w-full mb-3 rounded-xl" />
        </main>
        <BottomNav />
      </div>
    );
  }

  const formatTime = (dateStr: string) => {
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
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-warm-white)' }}>
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
        style={{
          background: 'rgba(250, 249, 245, 0.90)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
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
          Feed
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
            Share a moment
          </p>
          <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
        </div>
      </section>

      {!feedBlocked && (
        <div className="flex justify-center mb-6">
          <button
            onClick={() => setShowCompose(true)}
            className="px-6 py-2.5 text-sm rounded-full font-semibold"
            style={{
              background: 'var(--color-terracotta-gradient)',
              color: 'white',
              border: 'none',
            }}
          >
            + Post
          </button>
        </div>
      )}

      {/* Event Blocked Card */}
      {feedBlocked && (
        <div
          className="p-5 mb-5 text-center"
          style={{
            background: 'linear-gradient(135deg, #FFF8F0, #FFFDF7)',
            borderRadius: '16px',
            border: '1.5px solid #D4A853',
            boxShadow: '0 2px 12px rgba(212, 168, 83, 0.12)',
          }}
        >
          <p
            className="text-xl font-medium mb-2"
            style={{ fontFamily: 'var(--font-display)', color: '#5C4A2F' }}
          >
            Enjoy the moment!
          </p>
          <p className="text-sm mb-3" style={{ color: '#7A6B52' }}>
            {blockedMessage}
          </p>
          <div className="flex items-center justify-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4A853" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span className="text-xs" style={{ color: '#B8963E' }}>
              Don&apos;t forget to take pictures!
            </span>
          </div>
        </div>
      )}

      {/* Compose Card */}
      {showCompose && !feedBlocked && (
        <div
          className="p-4 mb-4"
          style={{
            background: 'var(--bg-pure-white)',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-soft)',
            border: '1px solid var(--border-light)',
          }}
        >
          <div className="flex gap-2 mb-3">
            {(['text', 'memory'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setComposeType(t)}
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{
                  background: composeType === t ? 'var(--color-terracotta)' : 'transparent',
                  color: composeType === t ? 'white' : 'var(--text-secondary)',
                  border: composeType === t ? 'none' : '1px solid var(--border-light)',
                }}
              >
                {t === 'text' ? 'Share a moment' : 'Favorite memory'}
              </button>
            ))}
          </div>
          <textarea
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
            placeholder={
              composeType === 'memory'
                ? `My favorite story about ${config?.couple_names?.name1 || 'the couple'}...`
                : 'Share a moment from the celebration...'
            }
            className="w-full resize-none rounded-xl p-3 text-sm"
            style={{
              background: 'var(--bg-soft-cream)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-light)',
              fontFamily: 'var(--font-body)',
              minHeight: '80px',
            }}
            maxLength={1000}
          />

          {/* Media preview */}
          {mediaPreview && mediaFile && (
            <div className="relative mt-2 rounded-xl overflow-hidden" style={{ maxHeight: '200px' }}>
              {mediaFile.type.startsWith('video/') ? (
                <video src={mediaPreview} className="w-full rounded-xl" style={{ maxHeight: '200px', objectFit: 'cover' }} />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={mediaPreview} alt="Selected" className="w-full rounded-xl" style={{ maxHeight: '200px', objectFit: 'cover' }} />
              )}
              <button
                onClick={clearMedia}
                className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.6)', color: 'white' }}
                aria-label="Remove"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* Upload progress */}
          {posting && uploadProgress > 0 && uploadProgress < 100 && (
            <div className="mt-2 w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-light)' }}>
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%`, background: 'var(--color-terracotta-gradient)' }} />
            </div>
          )}

          {postError && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-terracotta)' }}>
              {postError}
            </p>
          )}

          {/* Hidden file inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleMediaSelect(file);
              e.target.value = '';
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleMediaSelect(file);
              e.target.value = '';
            }}
          />

          <div className="flex justify-between items-center mt-2">
            <div className="flex items-center gap-1">
              {/* Camera button (opens native camera on mobile, file picker on desktop) */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label="Take photo or video"
                title="Take photo or video"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
              {/* Upload from library/files */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ color: 'var(--text-tertiary)' }}
                aria-label="Upload from library"
                title="Choose from library"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>
              <span className="text-xs ml-1" style={{ color: 'var(--text-tertiary)' }}>
                {composeText.length}/500
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowCompose(false); setComposeText(''); clearMedia(); }}
                className="px-4 py-2 text-sm rounded-full"
                style={{ color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handlePost}
                disabled={(!composeText.trim() && !mediaFile) || posting}
                className="px-4 py-2 text-sm rounded-full font-medium"
                style={{
                  background: (composeText.trim() || mediaFile) ? 'var(--color-terracotta-gradient)' : 'var(--border-light)',
                  color: (composeText.trim() || mediaFile) ? 'white' : 'var(--text-tertiary)',
                  border: 'none',
                }}
              >
                {posting ? (uploadProgress > 0 ? 'Uploading...' : 'Posting...') : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {fetchError && (
        <div
          className="p-3 rounded-xl text-sm mb-4 text-center"
          style={{ background: 'rgba(196, 112, 75, 0.08)', color: 'var(--color-terracotta)' }}
        >
          {fetchError}
          <button
            onClick={() => { setFetchError(''); setLoadingPosts(true); fetchPosts().finally(() => setLoadingPosts(false)); }}
            className="block mx-auto mt-2 underline text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* Posts */}
      {loadingPosts ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">&#128172;</p>
          <p className="text-lg font-medium mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            No posts yet
          </p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Be the first to share a moment!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="rounded-2xl p-4"
              style={{
                background: 'var(--bg-pure-white)',
                boxShadow: 'var(--shadow-soft)',
                border: post.is_pinned ? '1px solid var(--color-golden)' : '1px solid var(--border-light)',
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                  style={{ background: getAvatarColor(post.guest.display_name) }}
                >
                  {getInitials(post.guest.display_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {post.guest.display_name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {formatTime(post.created_at)}
                    {post.type === 'memory' && ' · Favorite memory'}
                    {post.is_pinned && ' · Pinned'}
                  </p>
                </div>
              </div>

              {post.content && (
                <p
                  className="text-sm mb-3 whitespace-pre-wrap"
                  style={{
                    color: 'var(--text-primary)',
                    fontFamily: post.type === 'memory' ? 'var(--font-display)' : 'var(--font-body)',
                    fontStyle: post.type === 'memory' ? 'italic' : 'normal',
                  }}
                >
                  {post.content}
                </p>
              )}

              {post.video_url && (
                <div className="rounded-xl overflow-hidden mb-3">
                  <video
                    src={post.video_url}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full rounded-xl"
                    style={{ maxHeight: '400px', objectFit: 'contain', background: '#000' }}
                  />
                </div>
              )}

              {post.photo_url && !post.video_url && (
                <div className="rounded-xl overflow-hidden mb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.photo_url} alt="" className="w-full" loading="lazy" />
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleLike(post.id)}
                  className="flex items-center gap-1.5 text-sm"
                  style={{ color: post.is_liked ? '#E53E3E' : 'var(--text-tertiary)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={post.is_liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  {post.like_count > 0 && post.like_count}
                </button>
                <button
                  onClick={() => toggleComments(post.id)}
                  className="flex items-center gap-1.5 text-sm"
                  style={{ color: expandedComments === post.id ? 'var(--color-terracotta)' : 'var(--text-tertiary)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {post.comment_count > 0 && post.comment_count}
                </button>
              </div>

              {/* Comments section */}
              {expandedComments === post.id && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-light)' }}>
                  {(comments[post.id] || []).map((comment) => (
                    <div key={comment.id} className="flex gap-2 mb-2">
                      <div className="flex-1">
                        <p className="text-xs">
                          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                            {comment.guest.display_name}
                          </span>{' '}
                          <span style={{ color: 'var(--text-secondary)' }}>{comment.content}</span>
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          {formatTime(comment.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Add a comment..."
                      className="flex-1 px-3 py-2 rounded-full text-xs"
                      style={{
                        background: 'var(--bg-soft-cream)',
                        border: '1px solid var(--border-light)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleComment(post.id);
                        }
                      }}
                    />
                    <button
                      onClick={() => handleComment(post.id)}
                      disabled={!commentText.trim() || postingComment}
                      className="px-3 py-2 rounded-full text-xs font-medium"
                      style={{
                        background: commentText.trim() ? 'var(--color-terracotta)' : 'var(--border-light)',
                        color: commentText.trim() ? 'white' : 'var(--text-tertiary)',
                      }}
                    >
                      {postingComment ? '...' : 'Post'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {nextCursor && (
            <div className="text-center mt-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-2 rounded-full text-sm font-medium"
                style={{ background: 'rgba(196, 112, 75, 0.08)', color: 'var(--color-terracotta)' }}
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}

      </main>
      <BottomNav />
    </div>
  );
}
