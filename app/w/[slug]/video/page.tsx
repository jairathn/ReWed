'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useCallback } from 'react';

type RecordMode = 'with-prompt' | 'free';
type Phase = 'viewfinder' | 'recording' | 'review' | 'uploading' | 'success';

const MAX_DURATION_SECONDS = 90;

export default function VideoRecordingPage() {
  const { config, guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recordMode, setRecordMode] = useState<RecordMode>('with-prompt');
  const [phase, setPhase] = useState<Phase>('viewfinder');
  const [promptIndex, setPromptIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Default Voast-style prompts when none configured
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

  // Build prompts list — use configured prompts or fall back to defaults
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
        video: { facingMode: 'user' },
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
  }, []);

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
  }, [phase === 'viewfinder', isLoading, isAuthenticated]);

  // Cleanup recorded URL on unmount
  useEffect(() => {
    return () => {
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    };
  }, [recordedUrl]);

  // Toast auto-dismiss
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

  const startRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    setElapsedSeconds(0);

    // Determine supported MIME type
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

        // Stop camera
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        setPhase('review');
      };

      recorder.start(1000); // collect data every second
      recorderRef.current = recorder;
      setPhase('recording');

      // Start timer
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

    // Determine mime type
    const mimeType = recordedBlob.type.includes('mp4') ? 'video/mp4' : 'video/webm';

    try {
      // Step 1: Get presigned URL
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

      // Step 2: Upload blob to presigned URL
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

      // Step 3: Complete upload
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

      // Return to viewfinder after short delay
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
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Loading state
  if (isLoading || !config || !guest) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#1a1410' }}>
        <div className="skeleton w-20 h-20 rounded-full" />
      </div>
    );
  }

  // Permission denied state
  if (permissionDenied && phase === 'viewfinder') {
    return (
      <div className="fixed inset-0 flex flex-col" style={{ background: '#1a1410' }}>
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
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="fixed inset-0" style={{ background: '#1a1410' }}>
      {/* ========== VIEWFINDER / RECORDING PHASE ========== */}
      {(phase === 'viewfinder' || phase === 'recording') && (
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

          {/* Back button — minimal chevron (only when not recording) */}
          {phase === 'viewfinder' && (
            <div className="absolute top-4 left-4 z-20 safe-top" style={{ paddingTop: '12px' }}>
              <button
                onClick={() => router.push(`/w/${slug}/capture`)}
                className="flex items-center gap-1"
                style={{ color: 'rgba(255,255,255,0.85)' }}
                aria-label="Back"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 4L6 8L10 12" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}

          {/* Recording indicator */}
          {phase === 'recording' && (
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full z-20 safe-top"
              style={{
                marginTop: '12px',
                background: 'rgba(18, 12, 6, 0.72)',
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

          {/* Frosted glass prompt card (only in with-prompt mode) */}
          {recordMode === 'with-prompt' && prompts.length > 0 && (
            <div
              className="absolute left-3 right-3 z-10"
              style={{
                top: phase === 'recording' ? '56px' : '52px',
                background: 'rgba(18, 12, 6, 0.72)',
                border: '0.5px solid rgba(200, 174, 140, 0.3)',
                borderRadius: '18px',
                padding: '16px 32px 14px',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}
            >
              {/* Prev/next nav buttons */}
              <button
                onClick={prevPrompt}
                disabled={phase === 'recording'}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(200, 174, 140, 0.15)',
                  border: '0.5px solid rgba(200, 174, 140, 0.3)',
                  opacity: phase === 'recording' ? 0.3 : 1,
                }}
                aria-label="Previous prompt"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M10 4L6 8L10 12" stroke="rgba(200,174,140,0.8)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>

              <button
                onClick={nextPrompt}
                disabled={phase === 'recording'}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  background: 'rgba(200, 174, 140, 0.15)',
                  border: '0.5px solid rgba(200, 174, 140, 0.3)',
                  opacity: phase === 'recording' ? 0.3 : 1,
                }}
                aria-label="Next prompt"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4L10 8L6 12" stroke="rgba(200,174,140,0.8)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>

              {/* Prompt question — Playfair Display italic */}
              <p
                className="text-center leading-relaxed mb-3"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '15px',
                  color: '#e8d5b8',
                  fontStyle: 'italic',
                  fontWeight: 400,
                }}
              >
                {currentPrompt}
              </p>

              {/* Pagination dots — active extends to pill */}
              {prompts.length > 1 && (
                <div className="flex justify-center items-center gap-1.5">
                  {prompts.slice(0, 7).map((_, i) => (
                    <div
                      key={i}
                      className="h-1.5 rounded-full transition-all duration-200"
                      style={{
                        width: i === promptIndex ? '16px' : '5px',
                        borderRadius: i === promptIndex ? '3px' : '50%',
                        background: i === promptIndex ? '#c8ae8c' : 'rgba(200, 174, 140, 0.3)',
                      }}
                    />
                  ))}
                  {prompts.length > 7 && (
                    <span className="text-[10px] ml-1" style={{ color: 'rgba(200, 174, 140, 0.4)' }}>
                      +{prompts.length - 7}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 z-20">
            <div className="flex flex-col items-center gap-4 pb-8 pt-4">
              {/* Mode Toggle (only when not recording) */}
              {phase === 'viewfinder' && (
                <div
                  className="inline-flex rounded-full"
                  style={{
                    background: 'rgba(20, 14, 8, 0.65)',
                    border: '0.5px solid rgba(200, 174, 140, 0.35)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    padding: '3px',
                  }}
                >
                  <button
                    onClick={() => setRecordMode('with-prompt')}
                    className="rounded-full transition-all"
                    style={{
                      padding: '5px 14px',
                      fontSize: '11px',
                      letterSpacing: '0.4px',
                      fontFamily: 'var(--font-body)',
                      background: recordMode === 'with-prompt' ? 'rgba(200, 174, 140, 0.25)' : 'transparent',
                      color: recordMode === 'with-prompt' ? '#e8d5b8' : 'rgba(255,255,255,0.45)',
                      border: recordMode === 'with-prompt' ? '0.5px solid rgba(200, 174, 140, 0.5)' : '0.5px solid transparent',
                    }}
                  >
                    With Prompt
                  </button>
                  <button
                    onClick={() => setRecordMode('free')}
                    className="rounded-full transition-all"
                    style={{
                      padding: '5px 14px',
                      fontSize: '11px',
                      letterSpacing: '0.4px',
                      fontFamily: 'var(--font-body)',
                      background: recordMode === 'free' ? 'rgba(200, 174, 140, 0.25)' : 'transparent',
                      color: recordMode === 'free' ? '#e8d5b8' : 'rgba(255,255,255,0.45)',
                      border: recordMode === 'free' ? '0.5px solid rgba(200, 174, 140, 0.5)' : '0.5px solid transparent',
                    }}
                  >
                    Free Record
                  </button>
                </div>
              )}

              {/* Record / Stop Button */}
              {phase === 'viewfinder' ? (
                <button
                  onClick={startRecording}
                  className="active:scale-95 transition-transform"
                  aria-label="Start recording"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <div
                    className="relative"
                    style={{
                      width: 70,
                      height: 70,
                      borderRadius: '50%',
                      border: '2px solid rgba(200, 174, 140, 0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {/* Breathing pulse ring */}
                    <div
                      className="record-pulse-ring"
                      style={{
                        position: 'absolute',
                        inset: '-6px',
                        borderRadius: '50%',
                        border: '1.5px solid rgba(196, 80, 60, 0.4)',
                      }}
                    />
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#c4503c' }} />
                  </div>
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="active:scale-95 transition-transform"
                  aria-label="Stop recording"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <div
                    className="relative"
                    style={{
                      width: 70,
                      height: 70,
                      borderRadius: '50%',
                      border: '2px solid rgba(196, 80, 60, 0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {/* Breathing pulse ring when recording */}
                    <div
                      className="record-pulse-ring"
                      style={{
                        position: 'absolute',
                        inset: '-6px',
                        borderRadius: '50%',
                        border: '1.5px solid rgba(196, 80, 60, 0.4)',
                      }}
                    />
                    <div style={{ width: 28, height: 28, borderRadius: 4, background: '#c4503c' }} />
                  </div>
                </button>
              )}
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
              style={{ objectFit: 'cover', background: '#1a1410' }}
            />
          </div>

          {/* Duration badge */}
          <div
            className="absolute top-14 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full z-20"
            style={{
              background: 'rgba(18, 12, 6, 0.72)',
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
                background: 'linear-gradient(to top, rgba(26,20,16,0.8) 0%, rgba(26,20,16,0.4) 70%, transparent 100%)',
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
        <div className="absolute inset-0 flex items-center justify-center px-8" style={{ background: 'rgba(26, 20, 16, 0.92)' }}>
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
        <div className="absolute inset-0 flex items-center justify-center px-8" style={{ background: 'rgba(26, 20, 16, 0.92)' }}>
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
              background: 'rgba(18, 12, 6, 0.72)',
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

      {/* Bottom Nav — hide during viewfinder/recording to keep camera immersive */}
      {phase !== 'viewfinder' && phase !== 'recording' && <BottomNav />}
    </div>
  );
}
