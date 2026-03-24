'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useWedding } from '@/components/WeddingProvider';

type NavItem = {
  id: string;
  label: string;
  path: string;
  /** SVG paths for the outlined (inactive) state */
  paths: string[];
  /** Optional: different SVG paths for the filled (active) state */
  filledPaths?: string[];
  /** Some filled icons need fill instead of stroke */
  fillWhenActive?: boolean;
};

const navItems: NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    path: '/home',
    paths: ['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M9 22V12h6v10'],
    filledPaths: ['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z'],
    fillWhenActive: true,
  },
  {
    id: 'schedule',
    label: 'Schedule',
    path: '/schedule',
    paths: ['M3 4h18a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V6a2 2 0 012-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  },
  {
    id: 'capture',
    label: 'Capture',
    path: '/capture',
    paths: ['M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z', 'M12 13a3 3 0 100-6 3 3 0 000 6z'],
    filledPaths: ['M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z'],
    fillWhenActive: true,
  },
  {
    id: 'social',
    label: 'Social',
    path: '/feed',
    paths: [
      'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2',
      'M9 11a4 4 0 100-8 4 4 0 000 8z',
      'M23 21v-2a4 4 0 00-3-3.87',
      'M16 3.13a4 4 0 010 7.75',
    ],
  },
  {
    id: 'more',
    label: 'More',
    path: '/_more',
    paths: [
      'M12 13a1 1 0 100-2 1 1 0 000 2z',
      'M19 13a1 1 0 100-2 1 1 0 000 2z',
      'M5 13a1 1 0 100-2 1 1 0 000 2z',
    ],
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { slug } = useWedding();
  const basePath = `/w/${slug}`;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 safe-bottom"
      style={{
        background: 'rgba(250, 249, 245, 0.80)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        borderTop: '1px solid rgba(208, 197, 175, 0.15)',
        boxShadow: '0 -4px 20px rgba(27, 28, 26, 0.06)',
        borderRadius: '12px 12px 0 0',
      }}
    >
      <div className="flex items-center justify-around max-w-lg mx-auto px-4 pt-2 pb-2">
        {navItems.map((item) => {
          // Skip "more" for now — it's a placeholder
          const href = item.id === 'more' ? `${basePath}/home` : `${basePath}${item.path}`;

          const isActive =
            item.id === 'home'
              ? pathname === `${basePath}/home` || pathname === basePath
              : item.id === 'capture'
                ? pathname.startsWith(`${basePath}/capture`) ||
                  pathname.startsWith(`${basePath}/photo`) ||
                  pathname.startsWith(`${basePath}/video`) ||
                  pathname.startsWith(`${basePath}/gallery`)
                : item.id === 'social'
                  ? pathname.startsWith(`${basePath}/feed`) ||
                    pathname.startsWith(`${basePath}/shared-gallery`)
                  : pathname.startsWith(`${basePath}${item.path}`);

          const activeColor = '#735C00';
          const inactiveColor = '#A8A29E';
          const color = isActive ? activeColor : inactiveColor;

          const svgPaths = isActive && item.filledPaths ? item.filledPaths : item.paths;
          const shouldFill = isActive && item.fillWhenActive;

          return (
            <Link
              key={item.id}
              href={href}
              className="flex flex-col items-center justify-center py-2"
              style={{
                textDecoration: 'none',
                transform: isActive ? 'scale(1.1)' : 'scale(1)',
                transition: 'transform 0.15s ease',
                minWidth: 48,
              }}
              aria-label={item.label}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill={shouldFill ? color : 'none'}
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mb-1"
              >
                {svgPaths.map((d, i) => (
                  <path key={i} d={d} />
                ))}
              </svg>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const,
                  color,
                  fontFamily: 'var(--font-body)',
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
