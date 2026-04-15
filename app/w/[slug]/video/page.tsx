'use client';

import { useWedding } from '@/components/WeddingProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';

type RecordMode = 'with-prompt' | 'free';
type Phase = 'viewfinder' | 'recording' | 'review' | 'uploading' | 'success';

const MAX_DURATION_SECONDS = 90;

export default function VideoRecordingPage() {
  const { config, guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode: RecordMode = searchParams.get('mode') === 'free' ? 'free' : 'with-prompt';

  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recordMode, setRecordMode] = useState<RecordMode>(initialMode);
  const [phase, setPhase] = useState<Phase>('viewfinder');
  const [promptIndex, setPromptIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Default prompts
  const DEFAULT_PROMPTS = {
    heartfelt: [
      "What's your favorite memory with the couple?",
      "What advice would you give the newlyweds?",
      "What do you love most about them as a couple?",
      "How did you know they were meant for each other?",
      "What makes their relationship special?",
    ],
    fun: [
      "What's the most embarrassing story you have about the couple?",
      "If their love story was a movie, what would it be called?",
      "Predict something about their future together!",
      "What song should they play at every anniversary?",
      "Describe the couple in exactly three words.",
    ],
    quick_takes: [
      "Cheers! Say something to the couple in 10 seconds!",
      "Give your best wedding toast — 30 seconds or less!",
      "One word to describe tonight?",
    ],
  };

  const configuredPrompts = config
    ? [
        ...(config.prompts.heartfelt || []),
        ...(config.prompts.fun || []),
        ...(config.prompts.quick_takes || []),
      ]
    : [];
  const prompts = configuredPrompts.length > 0
    ? configuredPrompts
    : [
        ...DEFAULT_PROMPTS.heartfelt,
        ...DEFAULT_PROMPTS.fun,
        ...DEFAULT_PROMPTS.quick_takes,
      ];
  const currentPrompt = prompts[promptIndex] || 'Share a message for the couple!';

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  // Start camera
  const startCamera = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setPermissionDenied(false);
    } catch (err) {
      console.error('Camera/mic access error:', err);
      setPermissionDenied(true);
    }
  }, [facingMode]);

  useEffect(() => {
    if ((phase === 'viewfinder' || phase === 'recording') && !isLoading && isAuthenticated) {
      startCamera();
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 'viewfinder', isLoading, isAuthenticated, facingMode]);

  useEffect(() => {
    return () => {
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    };
  }, [recordedUrl]);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const nextPrompt = () => {
    setPromptIndex((prev) => (prev + 1) % prompts.length);
  };

  const prevPrompt = () => {
    setPromptIndex((prev) => (prev - 1 + prompts.length) % prompts.length);
  };

  const flipCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const startRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    setElapsedSeconds(0);

    const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    let selectedMime = '';
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    try {
      const recorder = new MediaRecorder(streamRef.current, {
        mimeType: selectedMime || undefined,
        videoBitsPerSecond: 2_500_000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: selectedMime || 'video/webm',
        });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        setPhase('review');
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      setPhase('recording');

      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          if (next >= MAX_DURATION_SECONDS) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to start MediaRecorder:', err);
      setToastMessage('Could not start recording. Please try again.');
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      recorderRef.current = null;
    }
  };

  const reRecord = () => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    setRecordedBlob(null);
    setRecordedUrl('');
    setElapsedSeconds(0);
    setUploadProgress(0);
    setPhase('viewfinder');
  };

  const uploadVideo = async () => {
    if (!recordedBlob || !guest) return;

    setPhase('uploading');
    setUploadProgress(0);

    const mimeType = recordedBlob.type.includes('mp4') ? 'video/mp4' : 'video/webm';

    try {
      const presignRes = await fetch(`/api/v1/w/${slug}/upload/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video',
          mime_type: mimeType,
          size_bytes: recordedBlob.size,
        }),
      });

      if (!presignRes.ok) {
        throw new Error('Failed to get upload URL');
      }

      const presignData = await presignRes.json();
      const { upload_id, presigned_url, storage_key } = presignData.data;
      setUploadProgress(15);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', presigned_url);
        xhr.setRequestHeader('Content-Type', mimeType);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = 15 + Math.round((e.loaded / e.total) * 65);
            setUploadProgress(pct);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error('Upload network error'));
        xhr.send(recordedBlob);
      });

      setUploadProgress(85);

      const completeRes = await fetch(`/api/v1/w/${slug}/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id,
          storage_key,
          duration_ms: elapsedSeconds * 1000,
          prompt_answered: recordMode === 'with-prompt' ? currentPrompt : undefined,
        }),
      });

      if (!completeRes.ok) {
        throw new Error('Failed to complete upload');
      }

      setUploadProgress(100);
      setPhase('success');
      setToastMessage('Video saved to gallery!');

      setTimeout(() => {
        reRecord();
      }, 1500);
    } catch (err) {
      console.error('Upload failed:', err);
      setToastMessage('Upload failed. Please try again.');
      setPhase('review');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Loading state
  if (isLoading || !config || !guest) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0C0A09' }}>
        <div className="skeleton w-20 h-20 rounded-full" />
      </div>
    );
  }

  // Permission denied state
  if (permissionDenied && phase === 'viewfinder') {
    return (
      <div className="fixed inset-0 flex flex-col" style={{ background: '#0C0A09' }}>
        <div className="px-5 pt-12">
          <button
            onClick={() => router.push(`/w/${slug}/capture`)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.12)', border: '0.5px solid rgba(255,255,255,0.18)' }}
            aria-label="Back"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 4L6 8L10 12" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(200, 174, 140, 0.1)' }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(200,174,140,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </div>
            <h2
              className="text-xl font-medium mb-3"
              style={{ fontFamily: 'var(--font-display)', color: '#e8d5b8' }}
            >
              Camera &amp; Microphone Needed
            </h2>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: 'rgba(232, 213, 184, 0.5)' }}>
              To record a video message, please allow camera and microphone access in your browser settings.
            </p>
            <button onClick={() => startCamera()} className="btn-primary">
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: '#0C0A09' }}>
      {/* ========== VIEWFINDER / RECORDING PHASE ========== */}
      {(phase === 'viewfinder' || phase === 'recording') && (
        <>
          {/* Camera feed */}
          <div className="absolute inset-0">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full"
              style={{ objectFit: 'cover' }}
            />
            {/* Gradient overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(to bottom, rgba(12,10,9,0.6) 0%, transparent 30%, transparent 50%, rgba(12,10,9,0.8) 100%)',
              }}
            />
          </div>

          {/* Top App Bar */}
          <header
            className="absolute top-0 w-full z-30 flex justify-between items-center px-6 py-4"
            style={{
              background: 'rgba(250, 249, 245, 0.90)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/w/${slug}/capture`)}
                aria-label="Back"
                style={{ background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0, padding: 0 }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <h1
                className="text-2xl tracking-wide"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  color: 'var(--color-gold-dark)',
                }}
              >
                ReWed
              </h1>
            </div>
            <div className="w-8" />
          </header>

          {/* Recording indicator */}
          {phase === 'recording' && (
            <div
              className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full z-20"
              style={{
                background: 'rgba(12, 10, 9, 0.72)',
                border: '0.5px solid rgba(200, 174, 140, 0.3)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            >
              <div
                className="w-2 h-2 rounded-full recording-dot"
                style={{ background: '#c4503c' }}
              />
              <span className="text-xs font-normal tabular-nums" style={{ color: '#e8d5b8', letterSpacing: '0.3px' }}>
                {formatTime(elapsedSeconds)} / {formatTime(MAX_DURATION_SECONDS)}
              </span>
            </div>
          )}

          {/* Prompt Card — centered, with "A Digital Keepsake" label */}
          {recordMode === 'with-prompt' && prompts.length > 0 && (
            <section className="absolute left-0 right-0 z-10 w-full max-w-lg mx-auto px-6 flex flex-col items-center text-center" style={{ bottom: 220 }}>
              <div
                className="w-full px-6 py-7 rounded-xl"
                style={{
                  background: 'rgba(12, 10, 9, 0.40)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.10)',
                  boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
                }}
              >
                <span
                  className="block text-sm mb-2 uppercase"
                  style={{
                    fontFamily: 'var(--font-body)',
                    letterSpacing: '0.22em',
                    color: 'var(--color-gold-light)',
                    fontWeight: 600,
                  }}
                >
                  Your Video Toast
                </span>
                <h2
                  className="text-3xl leading-tight"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    color: '#ffffff',
                    fontWeight: 400,
                  }}
                >
                  {currentPrompt}
                </h2>

                {/* Pagination dots */}
                {prompts.length > 1 && (
                  <div className="mt-4 flex justify-center gap-2">
                    {prompts.slice(0, 3).map((_, i) => (
                      <span
                        key={i}
                        className="w-1 h-1 rounded-full"
                        style={{
                          background: i === Math.min(promptIndex, 2)
                            ? 'var(--color-gold-dark)'
                            : `rgba(168, 136, 63, ${0.5 - i * 0.15})`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Prev/Next buttons flanking the card */}
              {phase === 'viewfinder' && (
                <>
                  <button
                    onClick={prevPrompt}
                    className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      background: 'rgba(200, 174, 140, 0.15)',
                      border: '0.5px solid rgba(200, 174, 140, 0.3)',
                    }}
                    aria-label="Previous prompt"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M10 4L6 8L10 12" stroke="rgba(200,174,140,0.8)" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                  <button
                    onClick={nextPrompt}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      background: 'rgba(200, 174, 140, 0.15)',
                      border: '0.5px solid rgba(200, 174, 140, 0.3)',
                    }}
                    aria-label="Next prompt"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M6 4L10 8L6 12" stroke="rgba(200,174,140,0.8)" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </>
              )}
            </section>
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 z-20">
            <div className="flex flex-col items-center gap-6 pb-8 pt-4">
              {/* Mode Toggle (only when not recording) */}
              {phase === 'viewfinder' && (
                <div
                  className="inline-flex rounded-full"
                  style={{
                    background: 'rgba(12, 10, 9, 0.60)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    padding: '3px',
                  }}
                >
                  <button
                    onClick={() => setRecordMode('with-prompt')}
                    className="rounded-full transition-all"
                    style={{
                      padding: '6px 18px',
                      fontSize: 12,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase' as const,
                      fontWeight: recordMode === 'with-prompt' ? 600 : 400,
                      fontFamily: 'var(--font-body)',
                      background: recordMode === 'with-prompt' ? 'rgba(255, 255, 255, 0.10)' : 'transparent',
                      color: recordMode === 'with-prompt' ? '#ffffff' : 'rgba(168, 162, 158, 1)',
                    }}
                  >
                    Toast
                  </button>
                  <button
                    onClick={() => setRecordMode('free')}
                    className="rounded-full transition-all"
                    style={{
                      padding: '6px 18px',
                      fontSize: 12,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase' as const,
                      fontWeight: recordMode === 'free' ? 600 : 400,
                      fontFamily: 'var(--font-body)',
                      background: recordMode === 'free' ? 'rgba(255, 255, 255, 0.10)' : 'transparent',
                      color: recordMode === 'free' ? '#ffffff' : 'rgba(168, 162, 158, 1)',
                    }}
                  >
                    Free
                  </button>
                </div>
              )}

              {/* Recording Button Group — flip camera, record, flash */}
              <div className="flex items-center gap-10">
                {/* Flip camera */}
                <button
                  onClick={flipCamera}
                  className="transition-colors"
                  style={{ color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none', cursor: 'pointer' }}
                  aria-label="Flip camera"
                  disabled={phase === 'recording'}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 19H4a2 2 0 01-2-2V7a2 2 0 012-2h5" />
                    <path d="M13 5h7a2 2 0 012 2v10a2 2 0 01-2 2h-5" />
                    <polyline points="16 3 19 6 16 9" />
                    <polyline points="8 21 5 18 8 15" />
                  </svg>
                </button>

                {/* Central Record Button */}
                {phase === 'viewfinder' ? (
                  <button
                    onClick={startRecording}
                    className="active:scale-95 transition-transform"
                    aria-label="Start recording"
                    style={{ WebkitTapHighlightColor: 'transparent', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <div className="relative" style={{ width: 76, height: 76 }}>
                      {/* Breathing pulse ring */}
                      <div
                        className="record-pulse-ring absolute"
                        style={{
                          inset: '-6px',
                          borderRadius: '50%',
                          border: '1.5px solid rgba(157, 66, 43, 0.3)',
                        }}
                      />
                      {/* Outer ring */}
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          border: '2.5px solid rgba(255, 255, 255, 0.2)',
                        }}
                      />
                      {/* Inner fill */}
                      <div
                        className="absolute rounded-full"
                        style={{
                          top: 8,
                          left: 8,
                          right: 8,
                          bottom: 8,
                          background: 'var(--color-terracotta)',
                          boxShadow: '0 4px 20px rgba(196, 112, 75, 0.4)',
                        }}
                      />
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="active:scale-95 transition-transform"
                    aria-label="Stop recording"
                    style={{ WebkitTapHighlightColor: 'transparent', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <div className="relative" style={{ width: 76, height: 76 }}>
                      <div
                        className="record-pulse-ring absolute"
                        style={{
                          inset: '-6px',
                          borderRadius: '50%',
                          border: '1.5px solid rgba(196, 80, 60, 0.4)',
                        }}
                      />
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          border: '2.5px solid rgba(196, 80, 60, 0.5)',
                        }}
                      />
                      {/* Stop square */}
                      <div
                        className="absolute"
                        style={{
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          width: 24,
                          height: 24,
                          borderRadius: 4,
                          background: '#c4503c',
                        }}
                      />
                    </div>
                  </button>
                )}

                {/* Flash placeholder */}
                <button
                  className="transition-colors"
                  style={{ color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none', cursor: 'pointer' }}
                  aria-label="Flash"
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </button>
              </div>

              {/* Timer/Status */}
              <div className="flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.8)' }}>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: phase === 'recording' ? 'var(--color-terracotta)' : 'rgba(255,255,255,0.4)',
                    animation: phase === 'recording' ? 'recording-pulse 1.2s ease-in-out infinite' : 'none',
                  }}
                />
                <span className="text-sm tabular-nums" style={{ fontFamily: 'monospace', letterSpacing: '-0.03em' }}>
                  {formatTime(elapsedSeconds)} / {formatTime(MAX_DURATION_SECONDS > 60 ? 60 : MAX_DURATION_SECONDS)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ========== REVIEW PHASE ========== */}
      {phase === 'review' && recordedUrl && (
        <>
          <div className="absolute inset-0 camera-vignette">
            <video
              ref={playbackRef}
              src={recordedUrl}
              controls
              playsInline
              className="absolute inset-0 w-full h-full"
              style={{ objectFit: 'cover', background: '#0C0A09' }}
            />
          </div>

          {/* Duration badge */}
          <div
            className="absolute top-14 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full z-20"
            style={{
              background: 'rgba(12, 10, 9, 0.72)',
              border: '0.5px solid rgba(200, 174, 140, 0.3)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <span className="text-xs font-normal tabular-nums" style={{ color: '#e8d5b8' }}>
              {formatTime(elapsedSeconds)}
            </span>
          </div>

          {/* Review Actions */}
          <div className="absolute bottom-0 left-0 right-0 z-20">
            <div
              className="px-6 pb-10 pt-8 flex gap-4 justify-center"
              style={{
                background: 'linear-gradient(to top, rgba(12,10,9,0.8) 0%, rgba(12,10,9,0.4) 70%, transparent 100%)',
              }}
            >
              <button
                onClick={reRecord}
                className="flex-1 max-w-[160px] py-4 rounded-full text-base font-semibold transition-transform active:scale-95"
                style={{
                  background: 'rgba(200, 174, 140, 0.1)',
                  color: '#e8d5b8',
                  border: '1px solid rgba(200, 174, 140, 0.3)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Re-record
              </button>
              <button
                onClick={uploadVideo}
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
        <div className="absolute inset-0 flex items-center justify-center px-8" style={{ background: 'rgba(12, 10, 9, 0.92)' }}>
          <div className="w-full max-w-xs text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(200, 174, 140, 0.1)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(200,174,140,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="text-base font-medium mb-4" style={{ color: '#e8d5b8', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>
              Saving your video...
            </p>
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ background: 'rgba(200, 174, 140, 0.1)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${uploadProgress}%`,
                  background: 'var(--color-terracotta-gradient)',
                }}
              />
            </div>
            <p className="text-sm mt-2" style={{ color: 'rgba(200, 174, 140, 0.4)' }}>{uploadProgress}%</p>
          </div>
        </div>
      )}

      {/* ========== SUCCESS PHASE ========== */}
      {phase === 'success' && (
        <div className="absolute inset-0 flex items-center justify-center px-8" style={{ background: 'rgba(12, 10, 9, 0.92)' }}>
          <div className="text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{
                background: 'rgba(122, 139, 92, 0.15)',
                border: '2px solid var(--color-olive)',
              }}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-olive)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p
              className="text-xl font-medium"
              style={{ fontFamily: 'var(--font-display)', color: '#e8d5b8', fontStyle: 'italic' }}
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
              background: 'rgba(12, 10, 9, 0.72)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '0.5px solid rgba(200, 174, 140, 0.3)',
              color: '#e8d5b8',
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
