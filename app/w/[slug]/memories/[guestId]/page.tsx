import type { Metadata } from 'next';

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

export default async function ReelViewingPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const displayName = slug.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div
      className="min-h-screen flex flex-col items-center px-6 py-12"
      style={{ background: 'var(--bg-warm-gradient)' }}
    >
      <div className="w-full max-w-md">
        <h1
          className="text-2xl font-medium text-center mb-2"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)',
          }}
        >
          Your Memories
        </h1>
        <p
          className="text-sm text-center mb-8"
          style={{ color: 'var(--text-secondary)' }}
        >
          from {displayName}
        </p>

        {/* Video player placeholder */}
        <div
          className="w-full aspect-[9/16] rounded-2xl flex items-center justify-center mb-6"
          style={{
            background: 'var(--bg-soft-cream)',
            border: '1px solid var(--border-light)',
          }}
        >
          <div className="text-center">
            <p className="text-5xl mb-3">&#127916;</p>
            <p style={{ color: 'var(--text-secondary)' }}>
              Your reel will appear here
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-8">
          <button className="btn-primary flex-1">Download</button>
          <button className="btn-secondary flex-1">Share</button>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Made with ReWed
          </p>
          <p
            className="text-xs mt-1"
            style={{ color: 'var(--color-terracotta)' }}
          >
            Want this for your wedding?
          </p>
        </div>
      </div>
    </div>
  );
}
