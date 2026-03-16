'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';

type Mode = 'photo' | 'ai-portrait';
type Phase = 'viewfinder' | 'review' | 'style-picker' | 'uploading' | 'success';

const AI_STYLES: { id: string; name: string; emoji: string }[] = [
  { id: 'castle-wedding', name: 'Castle Wedding', emoji: '🏰' },
  { id: 'mughal', name: 'Mughal Royalty', emoji: '👑' },
  { id: 'bollywood-poster', name: 'Bollywood Poster', emoji: '🎬' },
  { id: 'watercolor', name: 'Watercolor', emoji: '🎨' },
  { id: 'renaissance', name: 'Renaissance', emoji: '🖼️' },
  { id: 'pop-art', name: 'Pop Art', emoji: '🎯' },
  { id: 'anime', name: 'Anime', emoji: '✨' },
  { id: 'oil-painting', name: 'Oil Painting', emoji: '🖌️' },
  { id: 'pixel-art', name: 'Pixel Art', emoji: '👾' },
  { id: 'stained-glass', name: 'Stained Glass', emoji: '⛪' },
];

export default function PhotoBoothPage() {
  const { config, guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<Mode>('photo');
  const [phase, setPhase] = useState<Phase>('viewfinder');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);
  const [screenFlashing, setScreenFlashing] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  // Start camera
  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setPermissionDenied(false);

      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities?.() as Record<string, unknown> | undefined;
        setFlashSupported(!!capabilities?.torch);
        setFlashOn(false);
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setPermissionDenied(true);
    }
  }, []);

  useEffect(() => {
    if (phase === 'viewfinder' && !isLoading && isAuthenticated) {
      startCamera(facingMode);
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, facingMode, isLoading, isAuthenticated]);

  useEffect(() => {
    return () => {
      if (capturedUrl) {
        URL.revokeObjectURL(capturedUrl);
      }
    };
  }, [capturedUrl]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const flipCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const toggleFlash = async () => {
    if (flashSupported) {
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track) return;
      try {
        await track.applyConstraints({ advanced: [{ torch: !flashOn } as MediaTrackConstraintSet] });
        setFlashOn(!flashOn);
      } catch {
        setFlashOn(!flashOn);
      }
    } else {
      setFlashOn(!flashOn);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const doCapture = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          setCapturedBlob(blob);
          const url = URL.createObjectURL(blob);
          setCapturedUrl(url);

          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
          }

          setScreenFlashing(false);

          if (mode === 'ai-portrait') {
            setPhase('style-picker');
          } else {
            setPhase('review');
          }
        },
        'image/jpeg',
        0.92
      );
    };

    if (flashOn && !flashSupported) {
      setScreenFlashing(true);
      setTimeout(doCapture, 250);
    } else {
      doCapture();
    }
  };

  const retake = () => {
    if (capturedUrl) {
      URL.revokeObjectURL(capturedUrl);
    }
    setCapturedBlob(null);
    setCapturedUrl('');
    setSelectedStyle(null);
    setUploadProgress(0);
    setPhase('viewfinder');
  };

  const uploadPhoto = async (styleId?: string) => {
    if (!capturedBlob || !guest) return;

    setPhase('uploading');
    setUploadProgress(0);

    try {
      const presignRes = await fetch(`/api/v1/w/${slug}/upload/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'photo',
          mime_type: 'image/jpeg',
          size_bytes: capturedBlob.size,
        }),
      });

      if (!presignRes.ok) throw new Error('Failed to get upload URL');

      const presignData = await presignRes.json();
      const { upload_id, presigned_url, storage_key } = presignData.data;
      setUploadProgress(20);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presigned_url);
        xhr.setRequestHeader('Content-Type', 'image/jpeg');

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = 20 + Math.round((e.loaded / e.total) * 60);
            setUploadProgress(pct);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed with status ${xhr.status}`));
        };

        xhr.onerror = () => reject(new Error('Upload network error'));
        xhr.send(capturedBlob);
      });

      setUploadProgress(85);

      const completeRes = await fetch(`/api/v1/w/${slug}/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id, storage_key }),
      });

      if (!completeRes.ok) throw new Error('Failed to complete upload');

      setUploadProgress(100);

      if (styleId) {
        const completeData = await completeRes.json();
        const sourceUploadId = completeData.data?.upload?.id || upload_id;

        const portraitRes = await fetch(`/api/v1/w/${slug}/ai-portrait`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_upload_id: sourceUploadId,
            style_id: styleId,
          }),
        });
        if (!portraitRes.ok) {
          console.warn('AI portrait generation request failed:', await portraitRes.text());
        }
      }

      setPhase('success');
      setToastMessage(styleId ? 'Photo saved! AI portrait is generating...' : 'Photo saved to gallery!');

      setTimeout(() => { retake(); }, 1500);
    } catch (err) {
      console.error('Upload failed:', err);
      setToastMessage('Upload failed. Please try again.');
      setPhase('review');
    }
  };

  // Loading state
  if (isLoading || !config || !guest) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#000' }}>
        <div className="skeleton w-20 h-20 rounded-full" />
      </div>
    );
  }

  // Permission denied state
  if (permissionDenied && phase === 'viewfinder') {
    return (
      <div className="fixed inset-0 flex flex-col" style={{ background: '#000' }}>
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(255, 255, 255, 0.1)' }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </div>
            <h2 className="text-xl font-medium text-white mb-3" style={{ fontFamily: 'var(--font-display)' }}>
              Camera Access Needed
            </h2>
            <p className="text-white/60 text-sm mb-6 leading-relaxed">
              To use the photo booth, please allow camera access in your browser settings.
            </p>
            <button onClick={() => startCamera(facingMode)} className="btn-primary">
              Try Again
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="fixed inset-0" style={{ background: '#000' }}>
      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ========== VIEWFINDER PHASE ========== */}
      {phase === 'viewfinder' && (
        <>
          {/* Full-screen camera viewfinder */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: 'cover' }}
          />

          {/* Screen flash overlay */}
          {screenFlashing && (
            <div className="absolute inset-0 z-30" style={{ background: 'white' }} />
          )}

          {/* Top controls bar — glass morphism */}
          <div className="absolute top-0 left-0 right-0 z-20 safe-top">
            <div
              className="flex items-center justify-between px-4 pt-12 pb-3"
              style={{
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)',
              }}
            >
              {/* Flash toggle */}
              <button
                onClick={toggleFlash}
                className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{
                  background: flashOn ? 'rgba(255, 214, 10, 0.25)' : 'rgba(255, 255, 255, 0.12)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                }}
                aria-label={flashOn ? 'Turn off flash' : 'Turn on flash'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill={flashOn ? '#FFD60A' : 'none'} stroke={flashOn ? '#FFD60A' : 'white'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </button>

              {/* Mode Toggle */}
              <div
                className="inline-flex rounded-full p-1"
                style={{
                  background: 'rgba(0, 0, 0, 0.35)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                }}
              >
                <button
                  onClick={() => setMode('photo')}
                  className="px-5 py-2 rounded-full text-sm font-medium transition-all"
                  style={{
                    background: mode === 'photo' ? 'rgba(255, 255, 255, 0.22)' : 'transparent',
                    color: mode === 'photo' ? 'white' : 'rgba(255, 255, 255, 0.5)',
                  }}
                >
                  Photo
                </button>
                <button
                  onClick={() => setMode('ai-portrait')}
                  className="px-5 py-2 rounded-full text-sm font-medium transition-all"
                  style={{
                    background: mode === 'ai-portrait' ? 'rgba(255, 255, 255, 0.22)' : 'transparent',
                    color: mode === 'ai-portrait' ? 'white' : 'rgba(255, 255, 255, 0.5)',
                  }}
                >
                  AI Portrait
                </button>
              </div>

              {/* Flip camera */}
              <button
                onClick={flipCamera}
                className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                }}
                aria-label="Flip camera"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 16v4H4v-4" />
                  <path d="M4 8V4h16v4" />
                  <polyline points="7 12 12 7 17 12" />
                  <polyline points="17 12 12 17 7 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Bottom controls — Instagram style floating shutter */}
          <div className="absolute bottom-0 left-0 right-0 z-20">
            <div
              className="flex items-center justify-center pb-28 pt-8"
              style={{
                background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
              }}
            >
              {/* Gallery shortcut (left) */}
              <button
                onClick={() => router.push(`/w/${slug}/gallery`)}
                className="absolute left-8 bottom-32 w-12 h-12 rounded-xl overflow-hidden"
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '2px solid rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label="Gallery"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </button>

              {/* Shutter button — Instagram style */}
              <button
                onClick={capturePhoto}
                className="relative active:scale-95 transition-transform"
                aria-label="Take photo"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {/* Outer ring */}
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    border: '4px solid white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 20px rgba(0,0,0,0.3)',
                  }}
                >
                  {/* Inner fill */}
                  <div
                    style={{
                      width: 66,
                      height: 66,
                      borderRadius: '50%',
                      background: 'white',
                      transition: 'transform 0.1s',
                    }}
                  />
                </div>
              </button>

              {/* Flip camera shortcut (right) */}
              <button
                onClick={flipCamera}
                className="absolute right-8 bottom-32 w-12 h-12 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '2px solid rgba(255,255,255,0.2)',
                }}
                aria-label="Flip camera"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <polyline points="23 20 23 14 17 14" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ========== REVIEW PHASE ========== */}
      {phase === 'review' && capturedUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capturedUrl}
            alt="Captured photo"
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: 'cover' }}
          />

          {/* Review Actions — floating at bottom */}
          <div className="absolute bottom-0 left-0 right-0 z-20">
            <div
              className="px-6 pb-28 pt-8 flex gap-4 justify-center"
              style={{
                background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)',
              }}
            >
              <button
                onClick={retake}
                className="flex-1 max-w-[160px] py-4 rounded-full text-base font-semibold transition-transform active:scale-95"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  color: 'white',
                  border: '1.5px solid rgba(255, 255, 255, 0.3)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                }}
              >
                Retake
              </button>
              <button
                onClick={() => uploadPhoto()}
                className="flex-1 max-w-[160px] py-4 rounded-full text-base font-semibold transition-transform active:scale-95"
                style={{
                  background: 'var(--color-terracotta-gradient)',
                  color: 'white',
                  boxShadow: 'var(--shadow-terracotta)',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}

      {/* ========== STYLE PICKER PHASE (AI Portrait) ========== */}
      {phase === 'style-picker' && capturedUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capturedUrl}
            alt="Captured photo"
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: 'cover', filter: 'brightness(0.5)' }}
          />

          {/* Style picker overlay */}
          <div className="absolute inset-0 flex flex-col justify-end z-20">
            <div
              className="px-4 pt-6 pb-4"
              style={{
                background: 'rgba(0, 0, 0, 0.55)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
              }}
            >
              <h3
                className="text-white text-lg font-medium mb-4 text-center"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Choose a Portrait Style
              </h3>

              <div className="grid grid-cols-3 gap-3 max-h-[280px] overflow-y-auto">
                {(config.enabled_ai_styles.length > 0
                  ? AI_STYLES.filter((s) => config.enabled_ai_styles.includes(s.id))
                  : AI_STYLES
                ).map((style) => (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyle(style.id)}
                    className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all"
                    style={{
                      background:
                        selectedStyle === style.id
                          ? 'rgba(196, 112, 75, 0.4)'
                          : 'rgba(255, 255, 255, 0.08)',
                      border:
                        selectedStyle === style.id
                          ? '2px solid var(--color-terracotta)'
                          : '2px solid transparent',
                    }}
                  >
                    <span className="text-2xl">{style.emoji}</span>
                    <span className="text-white text-xs font-medium text-center leading-tight">
                      {style.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Style picker actions */}
            <div
              className="px-6 pb-28 pt-4 flex gap-4 justify-center"
              style={{
                background: 'rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
              }}
            >
              <button
                onClick={retake}
                className="flex-1 max-w-[160px] py-4 rounded-full text-base font-semibold transition-transform active:scale-95"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  color: 'white',
                  border: '1.5px solid rgba(255, 255, 255, 0.3)',
                }}
              >
                Retake
              </button>
              <button
                onClick={() => selectedStyle && uploadPhoto(selectedStyle)}
                disabled={!selectedStyle}
                className="flex-1 max-w-[160px] py-4 rounded-full text-base font-semibold transition-transform active:scale-95"
                style={{
                  background: selectedStyle
                    ? 'var(--color-terracotta-gradient)'
                    : 'rgba(255, 255, 255, 0.1)',
                  color: selectedStyle ? 'white' : 'rgba(255, 255, 255, 0.3)',
                  boxShadow: selectedStyle ? 'var(--shadow-terracotta)' : 'none',
                }}
              >
                Generate
              </button>
            </div>
          </div>
        </>
      )}

      {/* ========== UPLOADING PHASE ========== */}
      {phase === 'uploading' && (
        <div className="absolute inset-0 flex items-center justify-center px-8" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="w-full max-w-xs text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(255, 255, 255, 0.1)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="text-white text-base font-medium mb-4">
              Saving your photo...
            </p>
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ background: 'rgba(255, 255, 255, 0.1)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${uploadProgress}%`,
                  background: 'var(--color-terracotta-gradient)',
                }}
              />
            </div>
            <p className="text-white/40 text-sm mt-2">{uploadProgress}%</p>
          </div>
        </div>
      )}

      {/* ========== SUCCESS PHASE ========== */}
      {phase === 'success' && (
        <div className="absolute inset-0 flex items-center justify-center px-8" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{
                background: 'rgba(122, 139, 92, 0.2)',
                border: '2px solid var(--color-olive)',
              }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-olive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p
              className="text-white text-xl font-medium"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Saved!
            </p>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-12 left-4 right-4 z-50 flex justify-center" style={{ pointerEvents: 'none' }}>
          <div
            className="px-5 py-3 rounded-2xl text-sm font-medium text-white"
            style={{
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              pointerEvents: 'auto',
            }}
          >
            {toastMessage}
          </div>
        </div>
      )}

      {/* Bottom Nav — only show when not in viewfinder to keep camera clean */}
      {phase !== 'viewfinder' && <BottomNav />}
    </div>
  );
}
