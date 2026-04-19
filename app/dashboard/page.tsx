'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatLongDate } from '@/lib/utils/date-format';

interface Couple {
  id: string;
  email: string;
  created_at: string;
}

interface Wedding {
  id: string;
  slug: string;
  display_name: string;
  wedding_date: string | null;
  status: string;
  config: Record<string, unknown>;
  package_config: Record<string, unknown> | null;
  created_at: string;
}

type AuthState = 'loading' | 'unauthenticated' | 'authenticated';
type AuthMode = 'login' | 'register';

export default function DashboardHomePage() {
  // Auth state
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [couple, setCouple] = useState<Couple | null>(null);

  // Login/register form state
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Weddings state
  const [weddings, setWeddings] = useState<Wedding[]>([]);
  const [weddingsLoading, setWeddingsLoading] = useState(false);

  // Success message (from redirect after wedding creation)
  const [successMessage, setSuccessMessage] = useState('');

  // Check auth on mount
  useEffect(() => {
    checkAuth();

    // Check for success message in URL
    const params = new URLSearchParams(window.location.search);
    const msg = params.get('success');
    if (msg) {
      setSuccessMessage(msg);
      // Clean URL without reload
      window.history.replaceState({}, '', '/dashboard');
      // Auto-dismiss after 5 seconds
      setTimeout(() => setSuccessMessage(''), 5000);
    }
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/v1/dashboard/auth');
      if (res.ok) {
        const data = await res.json();
        setCouple(data.couple);
        setAuthState('authenticated');
      } else {
        setAuthState('unauthenticated');
      }
    } catch {
      setAuthState('unauthenticated');
    }
  };

  const fetchWeddings = useCallback(async () => {
    setWeddingsLoading(true);
    try {
      const res = await fetch('/api/v1/dashboard/weddings');
      if (res.ok) {
        const data = await res.json();
        setWeddings(data.weddings || []);
      }
    } catch {
      // Silently fail, user can retry
    } finally {
      setWeddingsLoading(false);
    }
  }, []);

  // Fetch weddings when authenticated
  useEffect(() => {
    if (authState === 'authenticated') {
      fetchWeddings();
    }
  }, [authState, fetchWeddings]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      const body: Record<string, string> = {
        action: authMode,
        email,
        password,
      };
      if (authMode === 'register' && displayName) {
        body.display_name = displayName;
      }

      const res = await fetch('/api/v1/dashboard/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error?.message || 'Something went wrong');
        return;
      }

      setCouple(data.couple);
      setAuthState('authenticated');
      setEmail('');
      setPassword('');
      setDisplayName('');
    } catch {
      setAuthError('Network error. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/dashboard/auth', { method: 'DELETE' });
    } catch {
      // Logout locally even if API fails
    }
    setCouple(null);
    setWeddings([]);
    setAuthState('unauthenticated');
  };

  const formatDate = (dateStr: string | null) =>
    formatLongDate(dateStr, { fallback: 'Date not set' });

  const statusLabel = (status: string) => {
    switch (status) {
      case 'setup':
        return { text: 'Setting up', color: 'var(--color-golden)' };
      case 'active':
        return { text: 'Active', color: 'var(--color-olive)' };
      case 'completed':
        return { text: 'Completed', color: 'var(--color-mediterranean-blue)' };
      case 'archived':
        return { text: 'Archived', color: 'var(--text-tertiary)' };
      default:
        return { text: status, color: 'var(--text-secondary)' };
    }
  };

  // ─── Loading State ───
  if (authState === 'loading') {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="skeleton" style={{ width: 200, height: 32, marginBottom: 8, borderRadius: 8 }} />
            <div className="skeleton" style={{ width: 240, height: 16, borderRadius: 6 }} />
          </div>
          <div className="skeleton" style={{ width: 160, height: 48, borderRadius: 999 }} />
        </div>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} style={{ padding: 24, borderRadius: 16, background: 'var(--bg-pure-white)', border: '1px solid var(--border-light)' }}>
              <div className="skeleton" style={{ width: '60%', height: 24, marginBottom: 12, borderRadius: 8 }} />
              <div className="skeleton" style={{ width: '40%', height: 16, marginBottom: 8, borderRadius: 6 }} />
              <div className="skeleton" style={{ width: '30%', height: 16, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Unauthenticated — Login/Register Form ───
  if (authState === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--bg-soft-cream)' }}>
        <div className="w-full max-w-md">
          {/* Brand */}
          <div className="text-center mb-10">
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontSize: 36,
                fontWeight: 400,
                color: 'var(--color-gold-dark)',
                margin: '0 0 16px',
                letterSpacing: '0.02em',
              }}
            >
              Zari
            </h1>
            <h2
              className="text-2xl mb-2"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
                fontWeight: 500,
              }}
            >
              {authMode === 'login' ? 'Welcome Back' : 'Create Your Account'}
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
              {authMode === 'login'
                ? 'Sign in to manage your weddings'
                : 'Get started with Zari'}
            </p>
          </div>

          <div
            style={{
              padding: 32,
              borderRadius: 20,
              background: 'var(--bg-pure-white)',
              border: '1px solid var(--border-light)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.04)',
            }}
          >
            <form onSubmit={handleAuthSubmit} className="space-y-5">
              {authMode === 'register' && (
                <div>
                  <label
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                  >
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Sarah & James"
                    required
                    className="w-full px-4 py-3 rounded-xl text-sm"
                    style={{
                      background: 'var(--bg-warm-white)',
                      border: '1.5px solid var(--border-light)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-body)',
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-3 rounded-xl text-sm"
                  style={{
                    background: 'var(--bg-warm-white)',
                    border: '1.5px solid var(--border-light)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                >
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={authMode === 'register' ? 'At least 8 characters' : 'Enter your password'}
                  required
                  minLength={authMode === 'register' ? 8 : undefined}
                  className="w-full px-4 py-3 rounded-xl text-sm"
                  style={{
                    background: 'var(--bg-warm-white)',
                    border: '1.5px solid var(--border-light)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)',
                    outline: 'none',
                  }}
                />
              </div>

              {authError && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    fontSize: 13,
                    background: 'rgba(196, 112, 75, 0.06)',
                    border: '1px solid rgba(196, 112, 75, 0.15)',
                    color: 'var(--color-terracotta)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide"
                style={{
                  background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
                  color: '#FDFBF7',
                  border: 'none',
                  cursor: authLoading ? 'not-allowed' : 'pointer',
                  opacity: authLoading ? 0.7 : 1,
                  boxShadow: '0 4px 16px rgba(198,163,85,0.25)',
                  fontFamily: 'var(--font-body)',
                  transition: 'all 0.15s',
                }}
              >
                {authLoading
                  ? 'Please wait...'
                  : authMode === 'login'
                    ? 'Sign In'
                    : 'Create Account'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setAuthError('');
                }}
                className="text-sm"
                style={{
                  color: 'var(--color-terracotta)',
                  fontFamily: 'var(--font-body)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                {authMode === 'login'
                  ? "Don't have an account? Sign up"
                  : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Authenticated — Dashboard ───
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      {/* Success Message */}
      {successMessage && (
        <div
          style={{
            marginBottom: 24,
            padding: '14px 20px',
            borderRadius: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(122, 139, 92, 0.06)',
            border: '1px solid rgba(122, 139, 92, 0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--color-olive)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--color-olive)' }}>
              {successMessage}
            </p>
          </div>
          <button
            onClick={() => setSuccessMessage('')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-olive)',
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontSize: 24,
                fontWeight: 400,
                color: 'var(--color-gold-dark)',
                margin: 0,
              }}
            >
              Zari
            </h1>
            <span
              style={{
                height: 20,
                width: 1,
                background: 'var(--border-light)',
              }}
            />
            <span
              className="text-xl"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
                fontWeight: 500,
              }}
            >
              Dashboard
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
            Welcome back, {couple?.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleLogout}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
              fontWeight: 500,
              background: 'none',
              border: '1px solid var(--border-light)',
              borderRadius: 10,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Log Out
          </button>
          <Link
            href="/dashboard/create"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 22px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
              color: '#FDFBF7',
              textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(198,163,85,0.25)',
              transition: 'all 0.15s',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Wedding
          </Link>
        </div>
      </div>

      {/* Weddings Loading */}
      {weddingsLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ padding: 24, borderRadius: 16, background: 'var(--bg-pure-white)', border: '1px solid var(--border-light)' }}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="skeleton" style={{ width: '50%', height: 24, marginBottom: 12, borderRadius: 8 }} />
                  <div className="skeleton" style={{ width: '35%', height: 16, marginBottom: 8, borderRadius: 6 }} />
                  <div className="skeleton" style={{ width: '25%', height: 16, borderRadius: 6 }} />
                </div>
                <div className="skeleton" style={{ width: 100, height: 36, borderRadius: 10 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Weddings List */}
      {!weddingsLoading && weddings.length > 0 && (
        <div className="space-y-4">
          {weddings.map((wedding) => {
            const status = statusLabel(wedding.status);
            return (
              <div
                key={wedding.id}
                style={{
                  padding: '24px 28px',
                  borderRadius: 16,
                  background: 'var(--bg-pure-white)',
                  border: '1px solid var(--border-light)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                  transition: 'box-shadow 0.15s',
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h2
                        className="text-xl truncate"
                        style={{
                          fontFamily: 'var(--font-display)',
                          color: 'var(--text-primary)',
                          fontWeight: 500,
                          margin: 0,
                        }}
                      >
                        {wedding.display_name}
                      </h2>
                      <span
                        className="shrink-0"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '3px 10px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: '0.03em',
                          background: `${status.color}12`,
                          color: status.color,
                        }}
                      >
                        {status.text}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <p className="text-sm" style={{ color: 'var(--text-secondary)', margin: 0 }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>URL:</span>{' '}
                        /w/{wedding.slug}
                      </p>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)', margin: 0 }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>Date:</span>{' '}
                        {formatDate(wedding.wedding_date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/dashboard/${wedding.id}/guests`}
                      style={{
                        padding: '8px 20px',
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: 'var(--font-body)',
                        borderRadius: 10,
                        background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
                        color: '#FDFBF7',
                        textDecoration: 'none',
                        boxShadow: '0 2px 8px rgba(198,163,85,0.2)',
                        transition: 'all 0.15s',
                      }}
                    >
                      Manage
                    </Link>
                    <Link
                      href={`/w/${wedding.slug}`}
                      style={{
                        padding: '8px 20px',
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: 'var(--font-body)',
                        borderRadius: 10,
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-light)',
                        textDecoration: 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      Guest App
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!weddingsLoading && weddings.length === 0 && (
        <div
          style={{
            padding: '48px 32px',
            borderRadius: 20,
            background: 'var(--bg-pure-white)',
            border: '1px solid var(--border-light)',
            textAlign: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              margin: '0 auto 16px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(198,163,85,0.1), rgba(196,112,75,0.06))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-gold-dark)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
          <h2
            className="text-xl mb-2"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
              fontWeight: 500,
            }}
          >
            No weddings yet
          </h2>
          <p
            className="text-sm mb-6 max-w-md mx-auto"
            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}
          >
            Create your first wedding to start building the guest experience.
            You&apos;ll be able to import guests, configure events, and customize
            everything.
          </p>
          <Link
            href="/dashboard/create"
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
              color: '#FDFBF7',
              textDecoration: 'none',
              boxShadow: '0 4px 16px rgba(198,163,85,0.25)',
            }}
          >
            Create Your First Wedding
          </Link>
        </div>
      )}
    </div>
  );
}
