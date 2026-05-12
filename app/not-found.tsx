import Link from 'next/link';

/**
 * Branded 404. Sits at the root of /app so it catches anything that doesn't
 * resolve under /w, /dashboard, /v, etc. The previous default Next.js 404 was
 * unstyled boilerplate; this matches the wedding palette and gives a back-
 * to-home link instead of stranding the user.
 */
export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        background: 'var(--bg-warm-gradient, linear-gradient(180deg, #FEF9F2 0%, #FEFCF9 40%, #FFF8F0 100%))',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-display, serif)',
          fontStyle: 'italic',
          fontSize: 14,
          color: 'var(--color-gold-dark, #A8883F)',
          letterSpacing: '0.04em',
          margin: 0,
        }}
      >
        Zari
      </p>
      <h1
        style={{
          fontFamily: 'var(--font-display, serif)',
          fontSize: 36,
          fontWeight: 500,
          color: 'var(--text-primary, #2C2825)',
          margin: '14px 0 8px',
          letterSpacing: '-0.01em',
        }}
      >
        This page doesn&apos;t exist
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-body, sans-serif)',
          fontSize: 15,
          color: 'var(--text-secondary, #8A8078)',
          maxWidth: 420,
          lineHeight: 1.6,
          margin: '0 0 28px',
        }}
      >
        But the wedding still does — check the link, or head back to where
        you came from.
      </p>
      <Link
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 22px',
          borderRadius: 999,
          background: 'var(--color-terracotta-gradient, linear-gradient(135deg, #C4704B 0%, #E8865A 100%))',
          color: '#FDFBF7',
          fontSize: 14,
          fontWeight: 600,
          fontFamily: 'var(--font-body, sans-serif)',
          textDecoration: 'none',
          letterSpacing: '0.02em',
        }}
      >
        Back to home
      </Link>
    </div>
  );
}
