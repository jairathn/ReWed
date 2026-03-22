'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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

interface HighlightReel {
  url: string;
  thumbnail_url: string | null;
  duration_ms: number | null;
  status: string;
}

interface MemoirData {
  wedding: {
    display_name: string;
    couple_names: { name1: string; name2: string };
    wedding_date: string | null;
    hashtag: string;
    venue_city: string | null;
    venue_country: string | null;
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
  highlight_reels: Record<string, HighlightReel>;
  memoir_message: string | null;
  carousel_photos: MemoirPhoto[];
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

function formatDateRange(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    const month = d.toLocaleDateString('en-US', { month: 'long' });
    const day = d.getDate();
    const year = d.getFullYear();
    // Show a range like "September 9 – 11, 2026"
    return `${month} ${day} – ${day + 2}, ${year}`;
  } catch {
    return dateStr;
  }
}

function coupleLabel(names: { name1: string; name2: string }): string {
  if (names.name1 && names.name2) return `${names.name1} & ${names.name2}`;
  return names.name1 || names.name2 || '';
}

/* ── Photo Carousel Strip ── */
function PhotoCarousel({ photos, reverse }: { photos: MemoirPhoto[]; reverse?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || photos.length === 0) return;

    let pos = reverse ? el.scrollWidth / 2 : 0;
    const speed = 0.3; // px per frame

    const tick = () => {
      if (reverse) {
        pos -= speed;
        if (pos <= 0) pos = el.scrollWidth / 2;
      } else {
        pos += speed;
        if (pos >= el.scrollWidth / 2) pos = 0;
      }
      el.scrollLeft = pos;
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [photos, reverse]);

  if (photos.length === 0) return null;

  // Duplicate photos for infinite scroll effect
  const doubled = [...photos, ...photos];

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-hidden"
      style={{ pointerEvents: 'none' }}
    >
      {doubled.map((photo, i) => (
        <div
          key={`${photo.id}-${i}`}
          className="flex-shrink-0 overflow-hidden"
          style={{
            width: 140,
            height: 100,
            borderRadius: 8,
            opacity: 0.6,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.thumbnail_url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ── */
export default function GuestMemoirPage() {
  const params = useParams<{ slug: string; guestId: string }>();
  const slug = params.slug;
  const guestId = params.guestId;

  const [data, setData] = useState<MemoirData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [audioMuted, setAudioMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

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

  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioMuted) {
      audio.play().catch(() => {});
      audio.muted = false;
      setAudioMuted(false);
    } else {
      audio.muted = true;
      setAudioMuted(true);
    }
  };

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
      <div className="min-h-screen" style={{ background: '#2C2825' }}>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="skeleton h-10 w-64 mb-3" style={{ opacity: 0.3 }} />
          <div className="skeleton h-5 w-48 mb-8" style={{ opacity: 0.2 }} />
          <div className="skeleton h-64 w-80 rounded-2xl" style={{ opacity: 0.15 }} />
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

  const { wedding, guest, highlight_reels, memoir_message, carousel_photos } = data;
  const couple = coupleLabel(wedding.couple_names) || wedding.display_name;
  const guestName = guest.display_name || guest.first_name;
  const keeperReel = highlight_reels?.keeper;
  const socialReel = highlight_reels?.reel;
  const hasHighlightVideo = keeperReel?.status === 'ready';
  const topPhotos = carousel_photos.slice(0, 12);
  const bottomPhotos = carousel_photos.slice(12, 24);
  const venueLocation = [wedding.venue_city, wedding.venue_country].filter(Boolean).join(', ');

  return (
    <>
      {/* Background audio */}
      <audio ref={audioRef} src="/audio/background-music.mp3" loop muted preload="none" />

      <div
        className="min-h-screen relative overflow-hidden"
        style={{ background: '#2C2825' }}
      >
        {/* ── Castell Background ── */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/castell.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.15,
            filter: 'blur(2px)',
          }}
        />

        {/* ── Content ── */}
        <div className="relative z-10 flex flex-col min-h-screen">

          {/* ── Top Photo Carousel ── */}
          <div className="pt-4 pb-2 overflow-hidden">
            <PhotoCarousel photos={topPhotos} />
          </div>

          {/* ── Center Card ── */}
          <div className="flex-1 flex items-center justify-center px-4 py-6">
            <div
              className="relative w-full max-w-md"
              style={{ perspective: '1200px' }}
            >
              <div
                style={{
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)',
                }}
              >
                {/* ── Front of Card ── */}
                <div
                  className="relative px-8 pt-10 pb-8 text-center"
                  style={{
                    background: 'rgba(254, 252, 249, 0.95)',
                    borderRadius: 20,
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                    backfaceVisibility: 'hidden',
                  }}
                >
                  {/* Decorative top accent */}
                  <p
                    className="text-[10px] font-medium uppercase tracking-[0.2em] mb-4"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    A Memoir For
                  </p>

                  {/* Guest Name in elegant script */}
                  <h1
                    className="text-[38px] font-normal leading-tight mb-1"
                    style={{
                      fontFamily: 'var(--font-display)',
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {guestName}
                  </h1>

                  <p
                    className="text-[12px] uppercase tracking-[0.15em] mb-6"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    from the wedding of
                  </p>

                  {/* Couple Names */}
                  <h2
                    className="text-[26px] font-normal mb-6"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      color: 'var(--color-terracotta)',
                    }}
                  >
                    {couple}
                  </h2>

                  {/* Gold divider */}
                  <div className="gold-divider mx-auto mb-6" style={{ maxWidth: 120 }} />

                  {/* Highlight Video */}
                  {hasHighlightVideo && (
                    <div
                      className="mb-6 overflow-hidden mx-auto"
                      style={{
                        borderRadius: 12,
                        border: '1px solid var(--border-light)',
                        boxShadow: 'var(--shadow-soft)',
                        maxWidth: 320,
                      }}
                    >
                      <video
                        src={keeperReel.url}
                        controls
                        poster={keeperReel.thumbnail_url || undefined}
                        className="w-full block"
                        style={{ aspectRatio: '16/9', objectFit: 'cover' }}
                        playsInline
                      />
                    </div>
                  )}

                  {/* Placeholder when no video yet */}
                  {!hasHighlightVideo && (
                    <div
                      className="mb-6 mx-auto flex items-center justify-center"
                      style={{
                        borderRadius: 12,
                        border: '1px dashed var(--border-medium)',
                        background: 'var(--bg-soft-cream)',
                        maxWidth: 320,
                        aspectRatio: '16/9',
                      }}
                    >
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        Your highlight reel is being crafted
                      </p>
                    </div>
                  )}

                  {/* Date & Location */}
                  <p
                    className="text-[18px] mb-1"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {formatDateRange(wedding.wedding_date) || formatWeddingDate(wedding.wedding_date)}
                  </p>
                  {venueLocation && (
                    <p className="text-[13px] mb-4" style={{ color: 'var(--text-secondary)' }}>
                      {venueLocation}
                    </p>
                  )}

                  {/* Hashtag */}
                  {wedding.hashtag && (
                    <p
                      className="text-[14px] font-medium mb-6"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontStyle: 'italic',
                        color: 'var(--color-golden)',
                      }}
                    >
                      #{wedding.hashtag}
                    </p>
                  )}

                  {/* View Your Gallery Button */}
                  <Link
                    href={`/w/${slug}/gallery`}
                    className="inline-block w-full py-3.5 rounded-full text-sm font-semibold transition-transform active:scale-[0.97]"
                    style={{
                      background: 'var(--color-terracotta-gradient)',
                      color: '#FFFFFF',
                      boxShadow: 'var(--shadow-terracotta)',
                      maxWidth: 280,
                      textAlign: 'center',
                      textDecoration: 'none',
                    }}
                  >
                    View Your Gallery
                  </Link>

                  {/* Share row */}
                  <div className="flex items-center justify-center gap-3 mt-5">
                    <button
                      onClick={handleCopyLink}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-medium transition-all"
                      style={{
                        background: 'var(--color-gold-faint)',
                        color: 'var(--color-gold)',
                        border: '0.5px solid var(--color-gold-rule)',
                        cursor: 'pointer',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      {copied ? 'Copied!' : 'Copy Link'}
                    </button>
                    {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                      <button
                        onClick={handleNativeShare}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-medium transition-all"
                        style={{
                          background: 'var(--color-terracotta-gradient)',
                          color: '#FFFFFF',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                </div>

                {/* ── Back of Card (Flip side — Personal Message) ── */}
                <div
                  className="absolute inset-0 px-8 py-10 flex flex-col items-center justify-center text-center"
                  style={{
                    background: 'rgba(254, 252, 249, 0.95)',
                    borderRadius: 20,
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  {/* Decorative open-quote */}
                  <span
                    className="block text-5xl leading-none mb-4"
                    style={{ color: 'var(--color-gold-rule)', fontFamily: 'Georgia, serif' }}
                  >
                    &ldquo;
                  </span>

                  <p
                    className="text-[16px] leading-relaxed mb-4 max-w-sm"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {memoir_message || `Thank you for being part of our special day, ${guestName}. Your presence made everything more beautiful.`}
                  </p>

                  <span
                    className="block text-5xl leading-none mb-6"
                    style={{ color: 'var(--color-gold-rule)', fontFamily: 'Georgia, serif' }}
                  >
                    &rdquo;
                  </span>

                  <div className="gold-divider mx-auto mb-4" style={{ maxWidth: 80 }} />

                  <p
                    className="text-[14px]"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontStyle: 'italic',
                      color: 'var(--color-terracotta)',
                    }}
                  >
                    With love, {couple}
                  </p>
                </div>
              </div>

              {/* ── Flip Tab ── */}
              <button
                onClick={() => setIsFlipped(!isFlipped)}
                className="absolute -right-1 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-1 py-6 px-2"
                style={{
                  background: 'var(--color-terracotta-gradient)',
                  borderRadius: '0 10px 10px 0',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  border: 'none',
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  boxShadow: '4px 0 12px rgba(0, 0, 0, 0.2)',
                  zIndex: 5,
                }}
              >
                {isFlipped ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(90deg)' }}>
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                    Flip Back
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ transform: 'rotate(90deg)' }}>
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    For You
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ── Bottom Photo Carousel ── */}
          <div className="pb-4 pt-2 overflow-hidden">
            <PhotoCarousel photos={bottomPhotos} reverse />
          </div>

          {/* ── Audio Toggle ── */}
          <button
            onClick={toggleAudio}
            className="fixed bottom-6 left-6 w-10 h-10 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              cursor: 'pointer',
              zIndex: 20,
              color: '#FFFFFF',
            }}
          >
            {audioMuted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>

          {/* ── Viral CTA at bottom ── */}
          <div className="px-6 pb-8 text-center">
            <div
              className="relative overflow-hidden p-6 mx-auto max-w-md"
              style={{
                borderRadius: 16,
                background: 'rgba(254, 252, 249, 0.08)',
                border: '1px solid rgba(198, 163, 85, 0.2)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <p
                className="text-[16px] font-normal mb-2"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: 'rgba(254, 252, 249, 0.9)',
                }}
              >
                Want this for your wedding?
              </p>
              <p
                className="text-[12px] mb-4"
                style={{ color: 'rgba(254, 252, 249, 0.5)' }}
              >
                Every guest gets their own memoir, highlight reel, and more.
              </p>
              <Link
                href="/"
                className="inline-block text-xs font-medium uppercase tracking-wide"
                style={{
                  padding: '10px 28px',
                  background: 'transparent',
                  border: '1px solid rgba(198, 163, 85, 0.4)',
                  color: 'var(--color-golden)',
                  borderRadius: 50,
                  letterSpacing: '0.06em',
                  textDecoration: 'none',
                }}
              >
                Learn More
              </Link>
            </div>
            <p className="text-[10px] mt-4" style={{ color: 'rgba(254, 252, 249, 0.25)' }}>
              Made with ReWed
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
