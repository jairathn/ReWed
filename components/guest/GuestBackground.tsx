'use client';

import { useWedding } from '@/components/WeddingProvider';

/**
 * Renders a fixed, full-screen background image behind all guest pages.
 * Controlled by the couple via the dashboard knowledge page — they pick an
 * image and set the opacity (0-0.30).  When no background is configured this
 * component renders nothing.
 */
export default function GuestBackground() {
  const { config } = useWedding();

  if (!config?.guest_background?.url) return null;

  const { url, opacity } = config.guest_background;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: opacity,
        }}
      />
      {/* Light wash so page titles stay readable over the photo */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to bottom, rgba(250,249,245,0.55) 0%, rgba(250,249,245,0.25) 260px, transparent 420px)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
