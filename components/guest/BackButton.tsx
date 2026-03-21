'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface BackButtonProps {
  /** Explicit href to navigate to. If omitted, uses router.back() */
  href?: string;
  /** Label text (default: "Back") */
  label?: string;
  /** Dark variant for immersive (camera/video) pages */
  variant?: 'default' | 'dark';
}

export default function BackButton({ href, label = 'Back', variant = 'default' }: BackButtonProps) {
  const router = useRouter();

  const isDark = variant === 'dark';

  const className = [
    'inline-flex items-center gap-1 text-sm font-medium transition-opacity active:opacity-60',
    isDark ? 'py-2' : 'py-2 mb-4',
  ].join(' ');

  const style = {
    color: isDark ? 'rgba(255, 255, 255, 0.8)' : 'var(--text-secondary)',
  };

  const chevron = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );

  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {chevron}
        {label}
      </Link>
    );
  }

  return (
    <button onClick={() => router.back()} className={className} style={style}>
      {chevron}
      {label}
    </button>
  );
}
