'use client';

import { useState, useRef, useEffect } from 'react';
import { useWedding } from '@/components/WeddingProvider';

export default function GuestAccountMenu() {
  const { guest, logout } = useWedding();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (!guest) return null;

  const initial = guest.first_name?.[0]?.toUpperCase() || '?';
  const fullName = [guest.first_name, guest.last_name].filter(Boolean).join(' ') || 'Guest';

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setOpen(false);
    }
  };

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center"
        style={{
          background: 'var(--color-gold-faint)',
          border: '1px solid var(--color-gold-rule)',
          cursor: 'pointer',
        }}
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--color-gold-dark)', fontFamily: 'var(--font-display)' }}
        >
          {initial}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: 240,
            background: 'var(--bg-pure-white)',
            borderRadius: 16,
            border: '1px solid var(--border-light)',
            boxShadow: '0 12px 32px rgba(27, 28, 26, 0.12)',
            overflow: 'hidden',
            zIndex: 60,
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--border-light)',
            }}
          >
            <p
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--text-tertiary)',
                margin: 0,
                fontFamily: 'var(--font-body)',
              }}
            >
              Signed in as
            </p>
            <p
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--text-primary)',
                margin: '2px 0 0',
                fontFamily: 'var(--font-display)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {fullName}
            </p>
          </div>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            role="menuitem"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              fontSize: 14,
              fontFamily: 'var(--font-body)',
              color: 'var(--color-terracotta)',
              cursor: loggingOut ? 'default' : 'pointer',
              opacity: loggingOut ? 0.6 : 1,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!loggingOut) e.currentTarget.style.background = 'rgba(196,112,75,0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
