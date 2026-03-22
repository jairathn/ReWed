'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Wedding {
  id: string;
  slug: string;
  display_name: string;
  wedding_date: string | null;
  status: string;
}

export default function WeddingManageLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ weddingId: string }>;
}) {
  const [weddingId, setWeddingId] = useState<string>('');
  const [wedding, setWedding] = useState<Wedding | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    params.then((p) => setWeddingId(p.weddingId));
  }, [params]);

  useEffect(() => {
    if (!weddingId) return;
    fetch(`/api/v1/dashboard/weddings/${weddingId}/overview`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.wedding) setWedding(data.wedding);
      })
      .catch(() => {});
  }, [weddingId]);

  const navItems = [
    { href: `/dashboard/${weddingId}`, label: 'Overview', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4' },
    { href: `/dashboard/${weddingId}/guests`, label: 'Guests', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z' },
    { href: `/dashboard/${weddingId}/settings`, label: 'Events', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { href: `/dashboard/${weddingId}/faq`, label: 'FAQ', icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { href: `/dashboard/${weddingId}/feed`, label: 'Feed', icon: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
    { href: `/dashboard/${weddingId}/highlights`, label: 'Highlights', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
    { href: `/dashboard/${weddingId}/analytics`, label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  ];

  const isActive = (href: string) => {
    if (href === `/dashboard/${weddingId}`) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <nav
        style={{
          width: 240,
          background: 'var(--bg-pure-white)',
          borderRight: '1px solid var(--border-light)',
          padding: '20px 0',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* Back to dashboard */}
        <Link
          href="/dashboard"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 20px',
            marginBottom: 8,
            fontSize: 13,
            color: 'var(--text-tertiary)',
            textDecoration: 'none',
            fontFamily: 'var(--font-body)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          All Weddings
        </Link>

        {/* Wedding name */}
        <div style={{ padding: '0 20px', marginBottom: 20 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 500,
              color: 'var(--text-primary)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {wedding?.display_name || 'Loading...'}
          </h2>
          {wedding?.slug && (
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
              /w/{wedding.slug}
            </p>
          )}
        </div>

        {/* Nav items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 20px',
                  fontSize: 14,
                  fontFamily: 'var(--font-body)',
                  fontWeight: active ? 500 : 400,
                  color: active ? 'var(--color-terracotta)' : 'var(--text-secondary)',
                  background: active ? 'rgba(196, 112, 75, 0.06)' : 'transparent',
                  borderRight: active ? '3px solid var(--color-terracotta)' : '3px solid transparent',
                  textDecoration: 'none',
                  transition: 'all 0.15s',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* View Guest App link */}
        {wedding?.slug && (
          <div style={{ marginTop: 'auto', padding: '20px' }}>
            <Link
              href={`/w/${wedding.slug}`}
              target="_blank"
              className="btn-secondary"
              style={{
                display: 'block',
                textAlign: 'center',
                fontSize: 13,
                padding: '10px 16px',
              }}
            >
              View Guest App
            </Link>
          </div>
        )}
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
