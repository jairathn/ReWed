'use client';

import { useEffect, useState, type ReactNode } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' styles the confirm button red (for destructive ops). */
  variant?: 'danger' | 'primary';
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

/**
 * Styled "are you sure?" modal for destructive (and other high-consequence)
 * operations. Replaces `window.confirm()` so confirmations match the app's
 * visual language and are consistent across the product.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  const confirmBackground =
    variant === 'danger'
      ? 'linear-gradient(135deg, #B44A2B, #C4704B)'
      : 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))';
  const confirmShadow =
    variant === 'danger'
      ? '0 2px 10px rgba(180, 74, 43, 0.25)'
      : '0 2px 8px rgba(198, 163, 85, 0.25)';

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
      aria-labelledby="confirm-dialog-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-pure-white)',
          borderRadius: 18,
          padding: 28,
          maxWidth: 440,
          width: '100%',
          boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: variant === 'danger' ? 'rgba(196,112,75,0.1)' : 'rgba(198,163,85,0.1)',
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
              stroke={variant === 'danger' ? 'var(--color-terracotta)' : 'var(--color-gold-dark)'}
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
              id="confirm-dialog-title"
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
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            style={{
              padding: '10px 24px',
              borderRadius: 10,
              border: 'none',
              background: confirmBackground,
              color: '#FDFBF7',
              fontSize: 14,
              fontWeight: 500,
              fontFamily: 'var(--font-body)',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.75 : 1,
              boxShadow: confirmShadow,
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
