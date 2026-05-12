'use client';

import { useEffect, useRef, useState } from 'react';

export interface UndoToastProps {
  /** Show/hide the toast. */
  open: boolean;
  /** Plain-text message. e.g. "To-do deleted." */
  message: string;
  /** Called when the user taps Undo. Implement restore here. */
  onUndo: () => Promise<void> | void;
  /** Called when the toast times out (user did NOT undo). Most callers just
   *  need this for analytics or to close the toast in their state — the
   *  destructive action already happened (soft-delete) before the toast
   *  appeared. */
  onTimeout?: () => void;
  /** Ms before the toast auto-dismisses. Default 8s. */
  durationMs?: number;
  /** Optional label override on the action button. Default "Undo". */
  actionLabel?: string;
}

/**
 * Bottom-center pill toast offering an Undo action.
 *
 * Pattern this component is designed for:
 *   1. User clicks a delete button.
 *   2. Caller calls the server's soft-delete endpoint immediately.
 *   3. Caller flips local UI state to remove the row and shows this toast.
 *   4. Tap Undo → caller calls server's restore endpoint and re-renders.
 *   5. No tap → toast fades out after durationMs. DB stays soft-deleted;
 *      the janitor cron hard-deletes after 30 days.
 *
 * The toast does NOT hold the delete in pending state — soft-delete is the
 * commit boundary. This avoids the "what if the user closes the tab during
 * the 8 seconds" failure mode of pure-optimistic-undo patterns.
 */
export default function UndoToast({
  open,
  message,
  onUndo,
  onTimeout,
  durationMs = 8000,
  actionLabel = 'Undo',
}: UndoToastProps) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(1); // 1 → 0 over durationMs
  const startedAt = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      startedAt.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      setProgress(1);
      setBusy(false);
      return;
    }
    startedAt.current = Date.now();
    const tick = () => {
      if (!startedAt.current) return;
      const elapsed = Date.now() - startedAt.current;
      const p = Math.max(0, 1 - elapsed / durationMs);
      setProgress(p);
      if (p > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    timeoutRef.current = window.setTimeout(() => {
      onTimeout?.();
    }, durationMs);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
    // onTimeout is a stable ref in most call sites; intentional omit to avoid
    // re-scheduling on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, durationMs]);

  if (!open) return null;

  const handleUndo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onUndo();
    } finally {
      // Caller is expected to close the toast (open=false) inside onUndo;
      // if they don't, we still clear local busy state.
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 95,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 14px 12px 18px',
        borderRadius: 999,
        background: 'rgba(27, 28, 26, 0.92)',
        color: '#FDFBF7',
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        maxWidth: 'calc(100vw - 32px)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
        backdropFilter: 'blur(12px)',
        overflow: 'hidden',
      }}
    >
      {/* Countdown line — sits at the bottom edge of the pill */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: 'rgba(255,255,255,0.15)',
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            background: 'rgba(255,255,255,0.45)',
            transition: 'width 80ms linear',
          }}
        />
      </div>
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {message}
      </span>
      <button
        type="button"
        onClick={handleUndo}
        disabled={busy}
        style={{
          padding: '6px 12px',
          borderRadius: 999,
          border: 'none',
          background: 'rgba(255,255,255,0.16)',
          color: '#FDFBF7',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: 'var(--font-body)',
          letterSpacing: '0.02em',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {busy ? 'Restoring…' : actionLabel}
      </button>
    </div>
  );
}
