'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useWedding } from '@/components/WeddingProvider';

const navItems = [
  {
    id: 'home',
    label: 'Home',
    path: '',
    paths: ['M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', 'M9 22V12h6v10'],
  },
  {
    id: 'capture',
    label: 'Capture',
    path: '/capture',
    paths: ['M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z', 'M12 13a3 3 0 100-6 3 3 0 000 6z'],
  },
  {
    id: 'travel',
    label: 'Travel',
    path: '/travel',
    elevated: true,
    paths: ['M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z', 'M9 3v15', 'M15 6v15'],
  },
  {
    id: 'gallery',
    label: 'Gallery',
    path: '/gallery',
    paths: ['M3 3h18a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V5a2 2 0 012-2z', 'M8.5 8.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z', 'M21 15l-5-5L5 21'],
  },
  {
    id: 'events',
    label: 'Events',
    path: '/schedule',
    paths: ['M3 4h18a2 2 0 012 2v14a2 2 0 01-2 2H3a2 2 0 01-2-2V6a2 2 0 012-2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'],
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
        height: 84,
        background: 'rgba(253, 251, 247, 0.95)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      {/* Shimmer top border */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: '0.5px',
          background: 'linear-gradient(90deg, rgba(198,163,85,0) 0%, rgba(198,163,85,0.3) 20%, rgba(212,183,106,0.6) 50%, rgba(198,163,85,0.3) 80%, rgba(198,163,85,0) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s ease-in-out infinite',
        }}
      />
      <div className="flex items-start justify-around max-w-lg mx-auto px-2 pt-2.5">
        {navItems.map((item) => {
          const href = item.path ? `${basePath}${item.path}` : `${basePath}/home`;
          const isActive =
            item.path === ''
              ? pathname === `${basePath}/home` || pathname === basePath
              : item.id === 'capture'
                ? pathname.startsWith(`${basePath}/capture`) ||
                  pathname.startsWith(`${basePath}/photo`) ||
                  pathname.startsWith(`${basePath}/video`)
                : pathname.startsWith(`${basePath}${item.path}`);

          if (item.elevated) {
            return (
              <Link
                key={item.id}
                href={href}
                className="flex flex-col items-center -mt-5"
                aria-label={item.label}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center mb-1"
                  style={{
                    background: 'linear-gradient(145deg, #A8883F, #C6A355, #D4B76A)',
                    boxShadow: '0 4px 20px rgba(198,163,85,0.25), 0 0 40px rgba(198,163,85,0.08)',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FDFBF7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    {item.paths.map((d, i) => <path key={i} d={d} />)}
                  </svg>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 500,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: isActive ? '#C6A355' : '#C8BFB3',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {item.label}
                </span>
              </Link>
            );
          }

          const stroke = isActive ? '#C6A355' : '#C8BFB3';

          return (
            <Link
              key={item.id}
              href={href}
              className="flex flex-col items-center gap-1 py-1 min-w-[56px]"
              aria-label={item.label}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                {item.paths.map((d, i) => <path key={i} d={d} />)}
              </svg>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 500,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: isActive ? '#C6A355' : '#C8BFB3',
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
