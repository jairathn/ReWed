import type { Metadata } from 'next';
import { WeddingProvider } from '@/components/WeddingProvider';
import GuestBackground from '@/components/guest/GuestBackground';

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;

  // In production, fetch wedding config for OG meta tags
  // For now, use slug-based defaults
  const displayName = slug.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  return {
    title: `${displayName} | Zari`,
    description: `Join ${displayName} and celebrate their special day. Share photos, record video messages, and create lasting memories.`,
    openGraph: {
      title: displayName,
      description: `You're invited to be part of ${displayName}. Capture moments, share messages, and take home your own keepsake reel.`,
      type: 'website',
    },
  };
}

export default async function WeddingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<Params>;
}) {
  const { slug } = await params;

  return (
    <WeddingProvider slug={slug}>
      <div
        className="min-h-screen relative"
        style={{ background: 'var(--bg-warm-white)' }}
      >
        <GuestBackground />
        <div style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </div>
      </div>
    </WeddingProvider>
  );
}
