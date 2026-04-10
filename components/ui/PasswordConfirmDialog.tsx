'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface PasswordConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Called only after the password verifies against the server. */
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

/**
 * Password-gated confirmation modal for high-consequence destructive ops
 * (bulk guest delete, event delete, etc.). The password is checked against
 * `POST /api/v1/dashboard/auth/verify-password` so a forgotten-open laptop
 * can't wipe wedding data in a single click.
 *
 * On success → runs `onConfirm`. On mismatch → shows inline error, keeps
 * dialog open. `onConfirm` is only ever called with a verified password.
 */
export default function PasswordConfirmDialog(props: PasswordConfirmDialogProps) {
  // Unmounting the body when closed guarantees a clean slate (password field
  // empty, error cleared, busy=false) on the next open — no effect cleanup
  // dance required.
  if (!props.open) return null;
  return <PasswordConfirmDialogBody {...props} />;
}

function PasswordConfirmDialogBody({
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: Omit<PasswordConfirmDialogProps, 'open'>) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the password field when the dialog opens.
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', handleKey);
    };
  }, [busy, onCancel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/dashboard/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message || 'Incorrect password. Please try again.');
        setBusy(false);
        inputRef.current?.select();
        return;
      }
      // Password verified — run the actual destructive action.
      await onConfirm();
      // Caller is responsible for closing the dialog (setting open=false)
      // because they may want to keep it open on action failure.
    } catch {
      setError('Could not verify password. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(27, 28, 26, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 20,
        backdropFilter: 'blur(2px)',
      }}
      onClick={() => !busy && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pw-confirm-title"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          background: 'var(--bg-pure-white)',
          borderRadius: 18,
          padding: 28,
          maxWidth: 460,
          width: '100%',
          boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'rgba(196,112,75,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-terracotta)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              id="pw-confirm-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 20,
                fontWeight: 500,
                margin: '0 0 6px',
                color: 'var(--text-primary)',
                lineHeight: 1.3,
              }}
            >
              {title}
            </h3>
            <div
              style={{
                fontSize: 14,
                color: 'var(--text-secondary)',
                margin: 0,
                fontFamily: 'var(--font-body)',
                lineHeight: 1.55,
              }}
            >
              {description}
            </div>
          </div>
        </div>

        <label
          htmlFor="pw-confirm-input"
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-primary)',
            marginBottom: 6,
            fontFamily: 'var(--font-body)',
          }}
        >
          Confirm your password
        </label>
        <input
          ref={inputRef}
          id="pw-confirm-input"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          disabled={busy}
          autoComplete="current-password"
          placeholder="Your account password"
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 10,
            border: `1px solid ${error ? 'var(--color-terracotta)' : 'var(--border-medium)'}`,
            background: 'var(--bg-pure-white)',
            fontSize: 14,
            fontFamily: 'var(--font-body)',
            color: 'var(--text-primary)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {error ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 13,
              color: 'var(--color-terracotta)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              border: '1px solid var(--border-light)',
              background: 'var(--bg-pure-white)',
              color: 'var(--text-secondary)',
              fontSize: 14,
              fontFamily: 'var(--font-body)',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={busy || !password}
            style={{
              padding: '10px 24px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #B44A2B, #C4704B)',
              color: '#FDFBF7',
              fontSize: 14,
              fontWeight: 500,
              fontFamily: 'var(--font-body)',
              cursor: busy || !password ? 'default' : 'pointer',
              opacity: busy || !password ? 0.6 : 1,
              boxShadow: '0 2px 10px rgba(180, 74, 43, 0.25)',
            }}
          >
            {busy ? 'Verifying…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
