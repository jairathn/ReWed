import type { Metadata } from 'next';
import Link from 'next/link';
import { getPool } from '@/lib/db/client';
import BackButton from '@/components/guest/BackButton';

type Params = { slug: string; guestId: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const displayName = slug.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  return {
    title: `Your Memories from ${displayName} | ReWed`,
    description: `Watch your personalized reel from ${displayName}. Your photos, messages, and moments, all in one beautiful video.`,
  };
}

async function getMemoriesData(slug: string, guestId: string) {
  try {
    const pool = getPool();

    const weddingResult = await pool.query(
      'SELECT id, display_name FROM weddings WHERE slug = $1',
      [slug]
    );
    if (weddingResult.rows.length === 0) return null;

    const wedding = weddingResult.rows[0];

    const guestResult = await pool.query(
      'SELECT id, first_name, last_name FROM guests WHERE id = $1 AND wedding_id = $2',
      [guestId, wedding.id]
    );

    const guest = guestResult.rows[0] || null;

    // Fetch guest's uploads
    const uploadsResult = await pool.query(
      `SELECT id, type, storage_key, thumbnail_key, mime_type, duration_ms, created_at
       FROM uploads WHERE guest_id = $1 AND wedding_id = $2 AND status = 'ready'
       ORDER BY created_at DESC`,
      [guestId, wedding.id]
    );

    // Fetch guest's AI portraits
    const portraitsResult = await pool.query(
      `SELECT id, style_id, output_key, status, created_at
       FROM ai_jobs WHERE guest_id = $1 AND wedding_id = $2 AND type = 'portrait' AND status = 'completed'
       ORDER BY created_at DESC`,
      [guestId, wedding.id]
    );

    return {
      wedding: { display_name: wedding.display_name },
      guest,
      uploads: uploadsResult.rows,
      portraits: portraitsResult.rows,
    };
  } catch {
    return null;
  }
}

export default async function ReelViewingPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug, guestId } = await params;
  const data = await getMemoriesData(slug, guestId);

  if (!data || !data.guest) {
    const displayName = slug.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
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

  const { wedding, guest, uploads, portraits } = data;
  const photoCount = uploads.filter((u: { type: string }) => u.type === 'photo').length;
  const videoCount = uploads.filter((u: { type: string }) => u.type === 'video').length;
  const portraitCount = portraits.length;
  const totalItems = uploads.length + portraitCount;

  return (
    <div
      className="min-h-screen flex flex-col items-center px-6 py-12"
      style={{ background: 'var(--bg-warm-gradient)' }}
    >
      <div className="w-full max-w-md">
        <BackButton href={`/w/${slug}/home`} label="Home" />
        <h1
          className="text-2xl font-medium text-center mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)',
          }}
        >
          {guest.first_name}&apos;s Memories
        </h1>
        <p
          className="text-sm text-center mb-8"
          style={{ color: 'var(--text-secondary)' }}
        >
          from {wedding.display_name}
        </p>

        {/* Stats */}
        <div className="flex justify-center gap-6 mb-8">
          {photoCount > 0 && (
            <div className="text-center">
              <p className="text-2xl font-semibold" style={{ color: 'var(--color-terracotta)' }}>
                {photoCount}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Photos
              </p>
            </div>
          )}
          {videoCount > 0 && (
            <div className="text-center">
              <p className="text-2xl font-semibold" style={{ color: 'var(--color-terracotta)' }}>
                {videoCount}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Videos
              </p>
            </div>
          )}
          {portraitCount > 0 && (
            <div className="text-center">
              <p className="text-2xl font-semibold" style={{ color: 'var(--color-terracotta)' }}>
                {portraitCount}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Portraits
              </p>
            </div>
          )}
        </div>

        {/* Reel section */}
        <div
          className="w-full aspect-[9/16] rounded-2xl flex items-center justify-center mb-6"
          style={{
            background: 'var(--bg-soft-cream)',
            border: '1px solid var(--border-light)',
          }}
        >
          <div className="text-center px-6">
            <p className="text-5xl mb-3">&#127916;</p>
            {totalItems > 0 ? (
              <>
                <p
                  className="font-medium mb-1"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                >
                  Your reel is being created
                </p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  We&apos;re putting together a personalized video with your {totalItems} memories. You&apos;ll receive a notification when it&apos;s ready!
                </p>
              </>
            ) : (
              <>
                <p
                  className="font-medium mb-1"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                >
                  No memories yet
                </p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Take photos, record videos, and create portraits to build your reel!
                </p>
              </>
            )}
          </div>
        </div>

        {/* Action: Go to app */}
        <Link
          href={`/w/${slug}/home`}
          className="btn-primary w-full text-center block mb-3"
        >
          {totalItems > 0 ? 'Capture More Memories' : 'Start Capturing'}
        </Link>

        <Link
          href={`/w/${slug}/gallery`}
          className="btn-secondary w-full text-center block mb-8"
        >
          View Gallery
        </Link>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Made with ReWed
          </p>
          <Link
            href="/"
            className="text-xs mt-1 inline-block"
            style={{ color: 'var(--color-terracotta)' }}
          >
            Want this for your wedding?
          </Link>
        </div>
      </div>
    </div>
  );
}
