'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Date not set';
    try {
      return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Date not set';
    }
  };

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
            <div className="skeleton" style={{ width: 200, height: 32, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 240, height: 16 }} />
          </div>
          <div className="skeleton" style={{ width: 160, height: 48, borderRadius: 999 }} />
        </div>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="card p-6">
              <div className="skeleton" style={{ width: '60%', height: 24, marginBottom: 12 }} />
              <div className="skeleton" style={{ width: '40%', height: 16, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '30%', height: 16 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Unauthenticated — Login/Register Form ───
  if (authState === 'unauthenticated') {
    return (
      <div className="max-w-md mx-auto px-6 py-16">
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-medium mb-2"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            {authMode === 'login' ? 'Welcome Back' : 'Create Your Account'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {authMode === 'login'
              ? 'Sign in to manage your weddings'
              : 'Get started with ReWed'}
          </p>
        </div>

        <div className="card p-8" style={{ background: 'var(--bg-pure-white)' }}>
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
                    background: 'var(--bg-soft-cream)',
                    border: '1.5px solid var(--border-medium)',
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
                  background: 'var(--bg-soft-cream)',
                  border: '1.5px solid var(--border-medium)',
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
                  background: 'var(--bg-soft-cream)',
                  border: '1.5px solid var(--border-medium)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  outline: 'none',
                }}
              />
            </div>

            {authError && (
              <div
                className="p-3 rounded-xl text-sm"
                style={{
                  background: 'rgba(196, 112, 75, 0.08)',
                  color: 'var(--color-terracotta)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={authLoading}
              style={{ opacity: authLoading ? 0.7 : 1 }}
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
    );
  }

  // ─── Authenticated — Dashboard ───
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      {/* Success Message */}
      {successMessage && (
        <div
          className="mb-6 p-4 rounded-xl flex items-center justify-between"
          style={{
            background: 'rgba(122, 139, 92, 0.1)',
            border: '1px solid rgba(122, 139, 92, 0.3)',
          }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--color-olive)' }}>
            {successMessage}
          </p>
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
          <h1
            className="text-3xl font-medium"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            Your Weddings
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Welcome back, {couple?.email}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleLogout}
            className="btn-ghost"
            style={{ padding: '10px 20px', fontSize: 14 }}
          >
            Log Out
          </button>
          <Link
            href="/dashboard/create"
            className="btn-primary inline-flex items-center gap-2"
          >
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
            <div key={i} className="card p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="skeleton" style={{ width: '50%', height: 24, marginBottom: 12 }} />
                  <div className="skeleton" style={{ width: '35%', height: 16, marginBottom: 8 }} />
                  <div className="skeleton" style={{ width: '25%', height: 16 }} />
                </div>
                <div className="skeleton" style={{ width: 100, height: 36, borderRadius: 999 }} />
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
                className="card p-6"
                style={{ background: 'var(--bg-pure-white)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h2
                        className="text-xl font-medium truncate"
                        style={{
                          fontFamily: 'var(--font-display)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {wedding.display_name}
                      </h2>
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0"
                        style={{
                          background: `${status.color}18`,
                          color: status.color,
                        }}
                      >
                        {status.text}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>URL:</span>{' '}
                        /w/{wedding.slug}
                      </p>
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--text-tertiary)' }}>Date:</span>{' '}
                        {formatDate(wedding.wedding_date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/dashboard/${wedding.id}/guests`}
                      className="btn-primary"
                      style={{ padding: '8px 20px', fontSize: 14 }}
                    >
                      Manage
                    </Link>
                    <Link
                      href={`/w/${wedding.slug}`}
                      className="btn-secondary"
                      style={{ padding: '8px 20px', fontSize: 14 }}
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
          className="card p-12 text-center"
          style={{ background: 'var(--bg-pure-white)' }}
        >
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ background: 'var(--bg-soft-cream)' }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-terracotta)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
          <h2
            className="text-xl font-medium mb-2"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            No weddings yet
          </h2>
          <p
            className="text-sm mb-6 max-w-md mx-auto"
            style={{ color: 'var(--text-secondary)' }}
          >
            Create your first wedding to start building the guest experience.
            You&apos;ll be able to import guests, configure events, and customize
            everything.
          </p>
          <Link href="/dashboard/create" className="btn-primary inline-block">
            Create Your First Wedding
          </Link>
        </div>
      )}
    </div>
  );
}
