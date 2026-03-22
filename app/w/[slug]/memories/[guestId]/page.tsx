'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

/* ── Types ── */
interface MemoirPhoto {
  id: string;
  url: string;
  thumbnail_url: string;
}

interface MemoirVideo {
  id: string;
  url: string;
  thumbnail_url: string;
  duration_ms: number | null;
}

interface MemoirPortrait {
  id: string;
  url: string;
  style_id: string;
}

interface MemoirPost {
  id: string;
  content: string;
  type: string;
  created_at: string;
}

interface MemoirData {
  wedding: {
    display_name: string;
    couple_names: { name1: string; name2: string };
    wedding_date: string | null;
    hashtag: string;
  };
  guest: {
    id: string;
    first_name: string;
    last_name: string;
    display_name: string | null;
  };
  photos: MemoirPhoto[];
  videos: MemoirVideo[];
  portraits: MemoirPortrait[];
  posts: MemoirPost[];
  stats: {
    photo_count: number;
    video_count: number;
    portrait_count: number;
  };
}

/* ── Helpers ── */
function formatWeddingDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function coupleLabel(names: { name1: string; name2: string }): string {
  if (names.name1 && names.name2) return `${names.name1} & ${names.name2}`;
  return names.name1 || names.name2 || '';
}

function formatDuration(ms: number | null): string {
  if (!ms) return '0:00';
  const mins = Math.floor(ms / 60000);
  const secs = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${mins}:${secs}`;
}

/* ── Component ── */
export default function GuestMemoirPage() {
  const params = useParams<{ slug: string; guestId: string }>();
  const slug = params.slug;
  const guestId = params.guestId;

  const [data, setData] = useState<MemoirData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxType, setLightboxType] = useState<'photo' | 'video'>('photo');

  const fetchMemoir = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/w/${slug}/memoir/${guestId}`);
      if (!res.ok) throw new Error('Not found');
      const json = await res.json();
      setData(json.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [slug, guestId]);

  useEffect(() => {
    fetchMemoir();
  }, [fetchMemoir]);

  /* ── Share helpers ── */
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';

  const shareMessage = data
    ? `Check out my memories from ${coupleLabel(data.wedding.couple_names) || data.wedding.display_name}'s wedding! ${pageUrl}`
    : '';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = pageUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage)}`, '_blank');
  };

  const handleInstagram = () => {
    window.open('https://www.instagram.com/', '_blank');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${data?.guest.first_name}'s Memories`,
          text: shareMessage,
          url: pageUrl,
        });
      } catch {
        // User cancelled
      }
    }
  };

  /* ── Loading state ── */
  if (loading) {
    return (
      <div
        className="min-h-screen px-6 pt-12 pb-16"
        style={{ background: 'var(--bg-warm-gradient)' }}
      >
        <div className="max-w-lg mx-auto">
          <div className="skeleton h-10 w-64 mx-auto mb-3" />
          <div className="skeleton h-5 w-48 mx-auto mb-2" />
          <div className="skeleton h-4 w-32 mx-auto mb-8" />
          <div className="flex justify-center gap-6 mb-10">
            <div className="skeleton h-14 w-16" />
            <div className="skeleton h-14 w-16" />
            <div className="skeleton h-14 w-16" />
          </div>
          <div className="gold-divider mb-10" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[3/4]" style={{ borderRadius: 12 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Error / Not Found ── */
  if (error || !data) {
    const displayName = slug.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
        style={{ background: 'var(--bg-warm-gradient)' }}
      >
        <div className="text-center max-w-md">
          <p className="text-5xl mb-4">&#128148;</p>
          <h1
            className="text-2xl font-medium mb-3"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Memories Not Found
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            We couldn&apos;t find memories for this guest from {displayName}.
          </p>
          <Link href={`/w/${slug}`} className="btn-primary inline-block">
            Go to {displayName}
          </Link>
        </div>
      </div>
    );
  }

  const { wedding, guest, photos, videos, portraits, posts, stats } = data;
  const couple = coupleLabel(wedding.couple_names) || wedding.display_name;
  const guestName = guest.display_name || guest.first_name;
  const hasPhotos = photos.length > 0;
  const hasVideos = videos.length > 0;
  const hasPortraits = portraits.length > 0;
  const hasPosts = posts.length > 0;
  const hasContent = hasPhotos || hasVideos || hasPortraits || hasPosts;

  return (
    <>
      <div
        className="min-h-screen px-6 pt-12 pb-16"
        style={{ background: 'var(--bg-warm-gradient)' }}
      >
        <div className="max-w-lg mx-auto">

          {/* ── Header ── */}
          <header className="text-center mb-8">
            <h1
              className="text-[34px] font-normal leading-tight mb-2"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              {guestName}&apos;s Memories
            </h1>
            <p
              className="text-[15px] mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              {couple}
              {wedding.wedding_date && (
                <span style={{ color: 'var(--text-tertiary)' }}>
                  {' '}&middot; {formatWeddingDate(wedding.wedding_date)}
                </span>
              )}
            </p>
            {wedding.hashtag && (
              <p
                className="text-[13px] font-medium mt-2"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  color: 'var(--color-gold)',
                }}
              >
                #{wedding.hashtag}
              </p>
            )}
          </header>

          {/* ── Stats ── */}
          {hasContent && (
            <div className="flex justify-center gap-8 mb-8">
              {stats.photo_count > 0 && (
                <div className="text-center">
                  <span
                    className="shimmer-text"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 28,
                      fontWeight: 400,
                      display: 'inline-block',
                    }}
                  >
                    {stats.photo_count}
                  </span>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Photos
                  </p>
                </div>
              )}
              {stats.video_count > 0 && (
                <div className="text-center">
                  <span
                    className="shimmer-text"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 28,
                      fontWeight: 400,
                      display: 'inline-block',
                    }}
                  >
                    {stats.video_count}
                  </span>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Videos
                  </p>
                </div>
              )}
              {stats.portrait_count > 0 && (
                <div className="text-center">
                  <span
                    className="shimmer-text"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 28,
                      fontWeight: 400,
                      display: 'inline-block',
                    }}
                  >
                    {stats.portrait_count}
                  </span>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Portraits
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="gold-divider mb-10" />

          {/* ── Photo Gallery (masonry 2-col) ── */}
          {hasPhotos && (
            <section className="mb-12">
              <h2
                className="text-[11px] font-medium uppercase tracking-widest mb-5 text-center"
                style={{ color: 'var(--text-tertiary)', letterSpacing: '0.12em' }}
              >
                Photos
              </h2>
              <div style={{ columns: 2, columnGap: 10 }}>
                {photos.map((photo, i) => (
                  <div
                    key={photo.id}
                    className="mb-2.5 overflow-hidden cursor-pointer"
                    style={{
                      breakInside: 'avoid',
                      borderRadius: 12,
                      border: '1px solid var(--border-light)',
                    }}
                    onClick={() => {
                      setLightboxUrl(photo.url);
                      setLightboxType('photo');
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbnail_url}
                      alt=""
                      className="w-full block"
                      loading={i < 4 ? 'eager' : 'lazy'}
                      style={{
                        aspectRatio: i % 3 === 0 ? '3/4' : '1/1',
                        objectFit: 'cover',
                      }}
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (img.src !== photo.url) img.src = photo.url;
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Videos ── */}
          {hasVideos && (
            <section className="mb-12">
              <h2
                className="text-[11px] font-medium uppercase tracking-widest mb-5 text-center"
                style={{ color: 'var(--text-tertiary)', letterSpacing: '0.12em' }}
              >
                Videos
              </h2>
              <div className="flex flex-col gap-4">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    className="relative overflow-hidden cursor-pointer"
                    style={{
                      borderRadius: 12,
                      border: '1px solid var(--border-light)',
                    }}
                    onClick={() => {
                      setLightboxUrl(video.url);
                      setLightboxType('video');
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={video.thumbnail_url}
                      alt=""
                      className="w-full block"
                      loading="lazy"
                      style={{ aspectRatio: '16/9', objectFit: 'cover' }}
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (img.src !== video.url) img.src = video.url;
                      }}
                    />
                    {/* Play button overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center"
                        style={{
                          background: 'rgba(0, 0, 0, 0.45)',
                          backdropFilter: 'blur(8px)',
                          border: '1.5px solid rgba(255, 255, 255, 0.3)',
                        }}
                      >
                        <div
                          style={{
                            width: 0,
                            height: 0,
                            borderTop: '8px solid transparent',
                            borderBottom: '8px solid transparent',
                            borderLeft: '14px solid rgba(255, 255, 255, 0.9)',
                            marginLeft: 3,
                          }}
                        />
                      </div>
                    </div>
                    {/* Duration badge */}
                    {video.duration_ms && (
                      <div
                        className="absolute bottom-2 right-2 text-[11px] font-medium px-2 py-0.5 rounded"
                        style={{
                          background: 'rgba(0, 0, 0, 0.6)',
                          color: 'rgba(255, 255, 255, 0.9)',
                        }}
                      >
                        {formatDuration(video.duration_ms)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── AI Portraits ── */}
          {hasPortraits && (
            <section className="mb-12">
              <h2
                className="text-[11px] font-medium uppercase tracking-widest mb-5 text-center"
                style={{ color: 'var(--text-tertiary)', letterSpacing: '0.12em' }}
              >
                AI Portraits
              </h2>
              <div
                className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-6"
                style={{ scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}
              >
                {portraits.map((portrait) => (
                  <div
                    key={portrait.id}
                    className="flex-shrink-0 overflow-hidden cursor-pointer"
                    style={{
                      width: portraits.length === 1 ? '100%' : '70%',
                      maxWidth: 280,
                      borderRadius: 14,
                      border: '1px solid var(--border-light)',
                      scrollSnapAlign: 'center',
                      boxShadow: 'var(--shadow-soft)',
                    }}
                    onClick={() => {
                      setLightboxUrl(portrait.url);
                      setLightboxType('photo');
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={portrait.url}
                      alt=""
                      className="w-full block"
                      loading="lazy"
                      style={{ aspectRatio: '3/4', objectFit: 'cover' }}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Written Memories / Toasts ── */}
          {hasPosts && (
            <section className="mb-12">
              <h2
                className="text-[11px] font-medium uppercase tracking-widest mb-5 text-center"
                style={{ color: 'var(--text-tertiary)', letterSpacing: '0.12em' }}
              >
                Words & Toasts
              </h2>
              <div className="flex flex-col gap-5">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="text-center px-4 py-6"
                    style={{
                      background: 'var(--bg-pure-white)',
                      borderRadius: 16,
                      border: '1px solid var(--border-light)',
                      boxShadow: 'var(--shadow-soft)',
                    }}
                  >
                    {/* Decorative open-quote */}
                    <span
                      className="block text-3xl leading-none mb-2"
                      style={{ color: 'var(--color-gold-rule)', fontFamily: 'Georgia, serif' }}
                    >
                      &ldquo;
                    </span>
                    <p
                      className="text-[15px] leading-relaxed"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontStyle: 'italic',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {post.content}
                    </p>
                    <span
                      className="block text-3xl leading-none mt-2"
                      style={{ color: 'var(--color-gold-rule)', fontFamily: 'Georgia, serif' }}
                    >
                      &rdquo;
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── No Content State ── */}
          {!hasContent && (
            <div className="text-center py-16">
              <p className="text-5xl mb-4">&#128247;</p>
              <p
                className="text-lg font-normal mb-2"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  color: 'var(--text-secondary)',
                }}
              >
                No memories captured yet
              </p>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Photos, videos, and portraits will appear here.
              </p>
            </div>
          )}

          <div className="gold-divider mb-10" />

          {/* ── Share Section (the viral hook) ── */}
          <section className="mb-12 text-center">
            <h3
              className="text-[20px] font-normal mb-6"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
              }}
            >
              Share Your Memories
            </h3>
            <div className="flex flex-col gap-3 max-w-xs mx-auto">
              {/* Copy Link */}
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-full text-sm font-medium transition-all"
                style={{
                  background: 'var(--bg-pure-white)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-medium)',
                  boxShadow: 'var(--shadow-soft)',
                  cursor: 'pointer',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                {copied ? 'Link Copied!' : 'Copy Link'}
              </button>

              {/* WhatsApp */}
              <button
                onClick={handleWhatsApp}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-full text-sm font-medium transition-all"
                style={{
                  background: '#25D366',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Share via WhatsApp
              </button>

              {/* Instagram */}
              <button
                onClick={handleInstagram}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-full text-sm font-medium transition-all"
                style={{
                  background: 'linear-gradient(135deg, #833AB4 0%, #E1306C 50%, #F77737 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
                Share to Instagram
              </button>

              {/* Native Share (if available) */}
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <button
                  onClick={handleNativeShare}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-full text-sm font-medium transition-all"
                  style={{
                    background: 'var(--color-terracotta-gradient)',
                    color: '#FFFFFF',
                    border: 'none',
                    boxShadow: 'var(--shadow-terracotta)',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  Share
                </button>
              )}
            </div>
          </section>

          <div className="gold-divider mb-10" />

          {/* ── Viral CTA ── */}
          <section className="mb-10">
            <div
              className="relative overflow-hidden p-7 text-center"
              style={{
                borderRadius: 20,
                background: 'var(--bg-pure-white)',
                border: '1px solid var(--color-gold-rule)',
                boxShadow: '0 0 30px rgba(198, 163, 85, 0.06), var(--shadow-soft)',
              }}
            >
              {/* Decorative gold corner accents */}
              <div
                className="absolute top-0 left-0 w-16"
                style={{ height: 1, background: 'linear-gradient(90deg, var(--color-gold), transparent)', opacity: 0.4 }}
              />
              <div
                className="absolute top-0 left-0 h-16"
                style={{ width: 1, background: 'linear-gradient(180deg, var(--color-gold), transparent)', opacity: 0.4 }}
              />
              <div
                className="absolute bottom-0 right-0 w-16"
                style={{ height: 1, background: 'linear-gradient(270deg, var(--color-gold), transparent)', opacity: 0.4 }}
              />
              <div
                className="absolute bottom-0 right-0 h-16"
                style={{ width: 1, background: 'linear-gradient(0deg, var(--color-gold), transparent)', opacity: 0.4 }}
              />

              <p
                className="text-[22px] font-normal mb-3"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'var(--text-primary)',
                  lineHeight: 1.3,
                }}
              >
                Want this for your wedding?
              </p>
              <p
                className="text-[13px] leading-relaxed mb-6 max-w-[260px] mx-auto"
                style={{ color: 'var(--text-secondary)' }}
              >
                Every guest gets their own memory page, AI portraits, and more.
              </p>
              <Link
                href="/"
                className="inline-block text-xs font-medium uppercase tracking-wide"
                style={{
                  padding: '12px 32px',
                  background: 'transparent',
                  border: '1px solid var(--color-gold-rule)',
                  color: 'var(--color-gold)',
                  borderRadius: 50,
                  letterSpacing: '0.06em',
                  transition: 'all 0.2s ease',
                }}
              >
                Learn More
              </Link>
            </div>
          </section>

          {/* ── Footer ── */}
          <footer className="text-center pb-4">
            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              Made with ReWed
            </p>
          </footer>
        </div>
      </div>

      {/* ── Lightbox Modal ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0, 0, 0, 0.92)', zIndex: 60 }}
          onClick={() => setLightboxUrl(null)}
        >
          {/* Close button */}
          <button
            className="absolute top-4 right-4 text-white p-2"
            onClick={() => setLightboxUrl(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', zIndex: 61 }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {lightboxType === 'video' ? (
            <video
              src={lightboxUrl}
              controls
              autoPlay
              className="max-w-full max-h-full rounded-lg"
              style={{ objectFit: 'contain' }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={lightboxUrl}
              alt=""
              className="max-w-full max-h-full rounded-lg"
              style={{ objectFit: 'contain', maxHeight: '90vh' }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </>
  );
}
