'use client';

import { useWedding } from '@/components/WeddingProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';

type Phase = 'viewfinder' | 'review' | 'uploading' | 'success';

export default function PhotoBoothPage() {
  const { config, guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>('viewfinder');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
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
          setPhase('review');
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
    setUploadProgress(0);
    setPhase('viewfinder');
  };

  const uploadPhoto = async () => {
    if (!capturedBlob || !guest) return;

    setPhase('uploading');
    setUploadProgress(0);

    try {
      console.log('[upload] Step 1: Requesting presigned URL, blob size:', capturedBlob.size);
      const presignRes = await fetch(`/api/v1/w/${slug}/upload/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'photo',
          mime_type: 'image/jpeg',
          size_bytes: capturedBlob.size,
        }),
      });

      if (!presignRes.ok) {
        const errText = await presignRes.text();
        console.error('[upload] Presign failed:', presignRes.status, errText);
        throw new Error(`Presign failed (${presignRes.status}): ${errText}`);
      }

      const presignData = await presignRes.json();
      console.log('[upload] Step 2: Presign response:', JSON.stringify(presignData.data, null, 2));
      const { upload_id, presigned_url, storage_key } = presignData.data;
      console.log('[upload] Presigned URL host:', new URL(presigned_url).hostname);
      setUploadProgress(20);

      console.log('[upload] Step 3: Uploading blob to R2...');
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
          console.log('[upload] XHR complete, status:', xhr.status, 'response:', xhr.responseText.substring(0, 200));
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText.substring(0, 200)}`));
        };

        xhr.onerror = () => {
          console.error('[upload] XHR network error');
          reject(new Error('Upload network error'));
        };
        xhr.send(capturedBlob);
      });

      console.log('[upload] Step 4: R2 upload success, confirming...');
      setUploadProgress(85);

      const completeRes = await fetch(`/api/v1/w/${slug}/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upload_id, storage_key }),
      });

      if (!completeRes.ok) {
        const errText = await completeRes.text();
        console.error('[upload] Complete failed:', completeRes.status, errText);
        throw new Error(`Complete failed (${completeRes.status}): ${errText}`);
      }
      console.log('[upload] Step 5: Upload complete confirmed');

      setUploadProgress(100);

      setPhase('success');
      setToastMessage('Photo saved to gallery!');

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
        <div className="px-4 pt-12">
          <button
            onClick={() => router.push(`/w/${slug}/capture`)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.1)' }}
            aria-label="Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
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
          {/* Camera feed with vignette */}
          <div className="absolute inset-0 camera-vignette">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full"
              style={{ objectFit: 'cover' }}
            />
          </div>

          {/* Corner bracket film frame overlay */}
          <div className="film-frame">
            <div className="film-frame-corner tl" />
            <div className="film-frame-corner tr" />
            <div className="film-frame-corner bl" />
            <div className="film-frame-corner br" />
          </div>

          {/* Screen flash overlay */}
          {screenFlashing && (
            <div className="absolute inset-0 z-30" style={{ background: 'white' }} />
          )}

          {/* Back button — minimal chevron */}
          <div className="absolute top-12 left-5 z-20">
            <button
              onClick={() => router.push(`/w/${slug}/capture`)}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(0, 0, 0, 0.2)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
              aria-label="Back"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>

          {/* Top-right controls row */}
          <div className="absolute top-12 right-5 z-20 flex items-center gap-3">
            {/* Flash toggle */}
            <button
              onClick={toggleFlash}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: flashOn ? 'rgba(212, 168, 83, 0.3)' : 'rgba(0, 0, 0, 0.2)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
              aria-label={flashOn ? 'Turn off flash' : 'Turn on flash'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill={flashOn ? '#D4A853' : 'none'} stroke={flashOn ? '#D4A853' : 'rgba(255,255,255,0.85)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </button>

            {/* Flip camera */}
            <button
              onClick={flipCamera}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: 'rgba(0, 0, 0, 0.2)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
              aria-label="Flip camera"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <polyline points="23 20 23 14 17 14" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
            </button>
          </div>

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 z-20">
            <div className="flex flex-col items-center gap-5 pb-10 pt-6">
              {/* Shutter button — white with gold ring and shadow */}
              <div className="flex items-center justify-center relative" style={{ width: '100%' }}>
                {/* Gallery shortcut (left) */}
                <button
                  onClick={() => router.push(`/w/${slug}/gallery`)}
                  className="absolute left-8 w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center"
                  style={{
                    background: 'rgba(254, 252, 249, 0.1)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1.5px solid rgba(254, 252, 249, 0.15)',
                  }}
                  aria-label="Gallery"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>

                <button
                  onClick={capturePhoto}
                  className="relative active:scale-95 transition-transform"
                  aria-label="Take photo"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {/* Outer terracotta accent ring */}
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: '50%',
                      border: '2px solid rgba(200, 174, 140, 0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {/* Inner white fill */}
                    <div
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.92)',
                        transition: 'transform 0.1s',
                      }}
                    />
                  </div>
                </button>

                {/* Flip camera shortcut (right) */}
                <button
                  onClick={flipCamera}
                  className="absolute right-8 w-12 h-12 rounded-full flex items-center justify-center"
                  style={{
                    background: 'rgba(254, 252, 249, 0.1)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1.5px solid rgba(254, 252, 249, 0.15)',
                  }}
                  aria-label="Flip camera"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" />
                    <polyline points="23 20 23 14 17 14" />
                    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                  </svg>
                </button>
              </div>
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

          {/* Review Actions — frosted bottom */}
          <div className="absolute bottom-0 left-0 right-0 z-20">
            <div
              className="px-6 pb-10 pt-8 flex gap-4 justify-center"
              style={{
                background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 70%, transparent 100%)',
              }}
            >
              <button
                onClick={retake}
                className="flex-1 max-w-[160px] py-4 rounded-full text-base font-semibold transition-transform active:scale-95"
                style={{
                  background: 'rgba(254, 252, 249, 0.12)',
                  color: '#FEFCF9',
                  border: '1.5px solid rgba(254, 252, 249, 0.25)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Retake
              </button>
              <button
                onClick={uploadPhoto}
                className="flex-1 max-w-[160px] py-4 rounded-full text-base font-semibold transition-transform active:scale-95"
                style={{
                  background: 'var(--color-terracotta-gradient)',
                  color: 'white',
                  boxShadow: 'var(--shadow-terracotta)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}

      {/* ========== UPLOADING PHASE ========== */}
      {phase === 'uploading' && (
        <div className="absolute inset-0 flex items-center justify-center px-8" style={{ background: 'rgba(44, 40, 37, 0.9)' }}>
          <div className="w-full max-w-xs text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(196, 112, 75, 0.15)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="text-base font-medium mb-4" style={{ color: '#FEFCF9', fontFamily: 'var(--font-display)' }}>
              Saving your photo...
            </p>
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ background: 'rgba(254, 252, 249, 0.1)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${uploadProgress}%`,
                  background: 'var(--color-terracotta-gradient)',
                }}
              />
            </div>
            <p className="text-sm mt-2" style={{ color: 'rgba(254, 252, 249, 0.4)' }}>{uploadProgress}%</p>
          </div>
        </div>
      )}

      {/* ========== SUCCESS PHASE ========== */}
      {phase === 'success' && (
        <div className="absolute inset-0 flex items-center justify-center px-8" style={{ background: 'rgba(44, 40, 37, 0.9)' }}>
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
              className="text-xl font-medium"
              style={{ fontFamily: 'var(--font-display)', color: '#FEFCF9' }}
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
            className="px-5 py-3 rounded-2xl text-sm font-medium"
            style={{
              background: 'rgba(44, 40, 37, 0.7)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              color: '#FEFCF9',
              pointerEvents: 'auto',
              fontFamily: 'var(--font-body)',
            }}
          >
            {toastMessage}
          </div>
        </div>
      )}

    </div>
  );
}
