'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useWedding } from '@/components/WeddingProvider';

const HomeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const VideoIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const CameraIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const GalleryIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const MapIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" />
    <line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);

const tabs = [
  { id: 'home', label: 'Home', icon: HomeIcon, path: '' },
  { id: 'video', label: 'Video', icon: VideoIcon, path: '/video' },
  { id: 'travel', label: 'Travel', icon: MapIcon, path: '/travel', elevated: true },
  { id: 'photo', label: 'Photo', icon: CameraIcon, path: '/photo' },
  { id: 'schedule', label: 'Events', icon: CalendarIcon, path: '/schedule' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { slug } = useWedding();
  const basePath = `/w/${slug}`;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 safe-bottom"
      style={{
        background: 'rgba(254, 252, 249, 0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid var(--border-light)',
      }}
    >
      <div className="flex items-end justify-around max-w-lg mx-auto px-2 pt-2 pb-2">
        {tabs.map((tab) => {
          const href = tab.path ? `${basePath}${tab.path}` : `${basePath}/home`;
          const isActive =
            tab.path === ''
              ? pathname === `${basePath}/home` || pathname === basePath
              : pathname.startsWith(`${basePath}${tab.path}`);
          const Icon = tab.icon;

          if (tab.elevated) {
            return (
              <Link
                key={tab.id}
                href={href}
                className="flex flex-col items-center -mt-5"
                aria-label={tab.label}
              >
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mb-1"
                  style={{
                    background: 'var(--color-terracotta-gradient)',
                    boxShadow: 'var(--shadow-terracotta)',
                    color: 'white',
                  }}
                >
                  <Icon />
                </div>
                <span
                  className="text-xs font-medium"
                  style={{
                    color: isActive ? 'var(--color-terracotta)' : 'var(--text-tertiary)',
                  }}
                >
                  {tab.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={tab.id}
              href={href}
              className="flex flex-col items-center py-1 min-w-[56px]"
              aria-label={tab.label}
              style={{
                color: isActive ? 'var(--color-terracotta)' : 'var(--text-tertiary)',
              }}
            >
              <Icon />
              <span className="text-xs font-medium mt-1">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
