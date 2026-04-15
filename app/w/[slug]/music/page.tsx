'use client';

import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useWedding } from '@/components/WeddingProvider';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Song {
  id: string;
  song_title: string;
  artist: string | null;
  created_at: string;
}

export default function MusicPage() {
  const { slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  const [songs, setSongs] = useState<Song[]>([]);
  const [loadingSongs, setLoadingSongs] = useState(true);
  const [songTitle, setSongTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  const fetchSongs = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/w/${slug}/music`);
      const data = await res.json();
      if (data.data?.songs) {
        setSongs(data.data.songs);
      }
    } catch {
      // silent
    } finally {
      setLoadingSongs(false);
    }
  }, [slug]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSongs();
    }
  }, [isAuthenticated, fetchSongs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!songTitle.trim() || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`/api/v1/w/${slug}/music`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          song_title: songTitle.trim(),
          artist: artist.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Something went wrong');
        return;
      }

      if (data.data?.song) {
        setSongs((prev) => [data.data.song, ...prev]);
        setSongTitle('');
        setArtist('');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const performDelete = async (songId: string) => {
    setDeletingId(songId);
    try {
      await fetch(`/api/v1/w/${slug}/music/${songId}`, { method: 'DELETE' });
      setSongs((prev) => prev.filter((s) => s.id !== songId));
    } catch {
      // silent
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col">
        <header
          className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
          style={{
            background: 'rgba(250, 249, 245, 0.55)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 0.5px 0 rgba(208, 197, 175, 0.25)',
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
          <div className="skeleton h-8 w-48 mb-2" />
          <div className="skeleton h-4 w-20 mb-6" style={{ borderRadius: '2px' }} />
          <div
            className="skeleton mb-4"
            style={{ height: '180px', borderRadius: '16px' }}
          />
          <div
            className="skeleton mb-3"
            style={{ height: '72px', borderRadius: '16px' }}
          />
          <div
            className="skeleton mb-3"
            style={{ height: '72px', borderRadius: '16px' }}
          />
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
        style={{
          background: 'rgba(250, 249, 245, 0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 0.5px 0 rgba(208, 197, 175, 0.25)',
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

      {/* Header */}
      <section className="mb-8 text-center">
        <h2
          className="text-5xl mb-3 tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)',
          }}
        >
          Song Requests
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
            What gets you on the dance floor?
          </p>
          <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
        </div>
      </section>

      {/* Compose Card */}
      <form onSubmit={handleSubmit}>
        <div
          style={{
            background: 'white',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-soft)',
            border: '1px solid var(--border-light)',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <p
            className="text-sm font-medium mb-3"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
          >
            Add a song
          </p>

          <input
            type="text"
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value)}
            placeholder="Song title *"
            maxLength={300}
            className="w-full rounded-xl px-4 py-3 text-sm mb-3"
            style={{
              background: 'var(--bg-warm)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
            }}
            disabled={submitting}
          />

          <input
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artist (optional)"
            maxLength={300}
            className="w-full rounded-xl px-4 py-3 text-sm mb-4"
            style={{
              background: 'var(--bg-warm)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
            }}
            disabled={submitting}
          />

          {error && (
            <p className="text-xs mb-3" style={{ color: '#e53e3e' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!songTitle.trim() || submitting}
            className="w-full py-3 rounded-full text-sm font-medium"
            style={{
              background: songTitle.trim()
                ? 'var(--color-terracotta)'
                : 'var(--border-light)',
              color: songTitle.trim() ? 'white' : 'var(--text-tertiary)',
              border: 'none',
              cursor: songTitle.trim() && !submitting ? 'pointer' : 'default',
              opacity: submitting ? 0.7 : 1,
              fontFamily: 'var(--font-body)',
              transition: 'opacity 0.2s',
            }}
          >
            {submitting ? 'Adding...' : 'Request Song'}
          </button>
        </div>
      </form>

      {/* Song List */}
      {loadingSongs ? (
        <div>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton mb-3"
              style={{ height: '72px', borderRadius: '16px' }}
            />
          ))}
        </div>
      ) : songs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">&#127925;</p>
          <p
            className="text-base font-medium mb-1"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            What song gets you on the dance floor?
          </p>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Add your first song request above
          </p>
        </div>
      ) : (
        <div>
          <p
            className="text-xs font-medium mb-3"
            style={{
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Your requests ({songs.length}/10)
          </p>
          {songs.map((song) => (
            <div
              key={song.id}
              style={{
                background: 'white',
                borderRadius: '16px',
                boxShadow: 'var(--shadow-soft)',
                border: '1px solid var(--border-light)',
                padding: '16px 20px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  className="text-sm font-medium"
                  style={{
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {song.song_title}
                </p>
                {song.artist && (
                  <p
                    className="text-xs mt-0.5"
                    style={{
                      color: 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {song.artist}
                  </p>
                )}
              </div>

              <button
                onClick={() => setConfirmDelete({ id: song.id, title: song.song_title })}
                disabled={deletingId === song.id}
                aria-label="Delete song request"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: deletingId === song.id ? 'default' : 'pointer',
                  padding: '8px',
                  borderRadius: '8px',
                  color: 'var(--text-tertiary)',
                  opacity: deletingId === song.id ? 0.4 : 1,
                  transition: 'opacity 0.2s',
                  flexShrink: 0,
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      </main>
      <BottomNav />

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remove this song request?"
        description={
          confirmDelete ? (
            <>
              <strong>{confirmDelete.title}</strong> will be removed from your song requests. You
              can always add it again later.
            </>
          ) : (
            ''
          )
        }
        confirmLabel="Remove song"
        onConfirm={async () => {
          if (confirmDelete) {
            await performDelete(confirmDelete.id);
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
