'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface ImageCropEditorProps {
  /** Image URL to crop. */
  url: string;
  /** Horizontal position 0-100 (0 = left edge, 50 = center, 100 = right edge). */
  cropX: number;
  /** Vertical position 0-100 (0 = top, 50 = center, 100 = bottom). */
  cropY: number;
  /** Zoom level. 1 = image just covers the frame, 3 = 3x zoom. */
  cropZoom: number;
  /** CSS aspect-ratio for the crop frame, e.g. "3 / 2". */
  aspectRatio: string;
  onCropChange: (x: number, y: number, zoom: number) => void;
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/**
 * Interactive image crop editor. The user drags to reposition the image
 * inside a fixed-aspect-ratio frame and uses a slider (or scroll wheel)
 * to zoom in and out. The frame shows exactly what guests will see.
 */
export default function ImageCropEditor({
  url,
  cropX,
  cropY,
  cropZoom,
  aspectRatio,
  onCropChange,
}: ImageCropEditorProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, cropX: 0, cropY: 0 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, cropX, cropY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [cropX, cropY]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !frameRef.current) return;
      const frame = frameRef.current.getBoundingClientRect();
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      // Dragging left → show more of the right → increase x.
      // Divide by zoom so panning is more precise when zoomed in.
      const sensitivity = 100 / cropZoom;
      const newX = clamp(
        dragStart.current.cropX - (dx / frame.width) * sensitivity,
        0,
        100
      );
      const newY = clamp(
        dragStart.current.cropY - (dy / frame.height) * sensitivity,
        0,
        100
      );
      onCropChange(
        Math.round(newX * 10) / 10,
        Math.round(newY * 10) / 10,
        cropZoom
      );
    },
    [dragging, cropZoom, onCropChange]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  // Scroll-to-zoom on the frame.
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.003;
      const newZoom = clamp(cropZoom + delta, 1, 3);
      onCropChange(cropX, cropY, Math.round(newZoom * 100) / 100);
    },
    [cropX, cropY, cropZoom, onCropChange]
  );

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    // { passive: false } so we can preventDefault to stop page scroll.
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  return (
    <div>
      {/* Crop frame — shows exactly what the guest sees. */}
      <div
        ref={frameRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          width: '100%',
          maxWidth: 420,
          aspectRatio,
          borderRadius: 10,
          border: '1px solid var(--border-light)',
          overflow: 'hidden',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
          background: 'var(--bg-soft-cream)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${cropX}% ${cropY}%`,
            transform: `scale(${cropZoom})`,
            transformOrigin: `${cropX}% ${cropY}%`,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Zoom slider row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 10,
          maxWidth: 420,
        }}
      >
        {/* Zoom-out icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-tertiary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>

        <input
          type="range"
          min="1"
          max="3"
          step="0.05"
          value={cropZoom}
          onChange={(e) =>
            onCropChange(cropX, cropY, parseFloat(e.target.value))
          }
          style={{ flex: 1, accentColor: 'var(--color-terracotta)' }}
        />

        {/* Zoom-in icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-tertiary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>

        <span
          style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-body)',
            fontVariantNumeric: 'tabular-nums',
            minWidth: 32,
            textAlign: 'right',
          }}
        >
          {cropZoom.toFixed(1)}x
        </span>

        <button
          type="button"
          onClick={() => onCropChange(50, 50, 1)}
          style={{
            padding: '4px 10px',
            borderRadius: 8,
            border: '1px solid var(--border-light)',
            background: 'var(--bg-pure-white)',
            fontSize: 10,
            fontWeight: 500,
            fontFamily: 'var(--font-body)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            whiteSpace: 'nowrap',
          }}
        >
          Reset
        </button>
      </div>

      <p
        style={{
          fontSize: 10,
          color: 'var(--text-tertiary)',
          margin: '6px 0 0',
          fontFamily: 'var(--font-body)',
          lineHeight: 1.5,
        }}
      >
        Drag to reposition. Scroll to zoom. This is how guests will see it.
      </p>
    </div>
  );
}
