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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#1a1a1a' }}>
        <div className="skeleton w-20 h-20 rounded-full" />
      </div>
    );
  }

  // Permission denied state
  if (permissionDenied && phase === 'viewfinder') {
    return (
      <div className="min-h-screen flex flex-col relative" style={{ background: '#1a1a1a' }}>
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(255, 255, 255, 0.1)' }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </div>
            <h2
              className="text-xl font-medium text-white mb-3"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Camera &amp; Microphone Needed
            </h2>
            <p className="text-white/60 text-sm mb-6 leading-relaxed">
              To record a video message, please allow camera and microphone access in your browser settings.
            </p>
            <button
              onClick={() => startCamera()}
              className="btn-primary"
            >
              Try Again
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative" style={{ background: '#1a1a1a' }}>
      {/* ========== VIEWFINDER / RECORDING PHASE ========== */}
      {(phase === 'viewfinder' || phase === 'recording') && (
        <>
          {/* Camera viewfinder */}
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full"
              style={{ objectFit: 'cover' }}
            />

            {/* Recording indicator */}
            {phase === 'recording' && (
              <div
                className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full z-10"
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full recording-dot"
                  style={{ background: '#E53E3E' }}
                />
                <span className="text-white text-sm font-medium tabular-nums">
                  {formatTime(elapsedSeconds)} / {formatTime(MAX_DURATION_SECONDS)}
                </span>
              </div>
            )}
          </div>

          {/* Prompt Card (only in with-prompt mode and viewfinder/recording) */}
          {recordMode === 'with-prompt' && prompts.length > 0 && (
            <div
              className="absolute top-16 left-4 right-4 z-10"
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div className="px-4 py-4 flex items-center gap-3">
                {/* Previous button */}
                <button
                  onClick={prevPrompt}
                  disabled={phase === 'recording'}
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    opacity: phase === 'recording' ? 0.3 : 1,
                  }}
                  aria-label="Previous prompt"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                {/* Prompt text */}
                <p
                  className="text-white text-center text-base font-medium flex-1 leading-snug"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {currentPrompt}
                </p>

                {/* Next button */}
                <button
                  onClick={nextPrompt}
                  disabled={phase === 'recording'}
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    opacity: phase === 'recording' ? 0.3 : 1,
                  }}
                  aria-label="Next prompt"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

              {/* Prompt dots */}
              {prompts.length > 1 && (
                <div className="flex justify-center gap-1.5 pb-3">
                  {prompts.slice(0, 7).map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full transition-colors"
                      style={{
                        background:
                          i === promptIndex ? 'white' : 'rgba(255, 255, 255, 0.3)',
                      }}
                    />
                  ))}
                  {prompts.length > 7 && (
                    <span className="text-white/30 text-[10px] ml-1">
                      +{prompts.length - 7}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Controls area: mode toggle + record button */}
          <div
            className="pb-28 pt-4 flex flex-col items-center gap-4 safe-bottom relative z-40 flex-shrink-0"
            style={{
              background: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            {/* Mode Toggle (only when not recording) */}
            {phase === 'viewfinder' && (
              <div
                className="inline-flex rounded-full p-1"
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                }}
              >
                <button
                  onClick={() => setRecordMode('with-prompt')}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
                  style={{
                    background:
                      recordMode === 'with-prompt'
                        ? 'rgba(255, 255, 255, 0.2)'
                        : 'transparent',
                    color:
                      recordMode === 'with-prompt'
                        ? 'white'
                        : 'rgba(255, 255, 255, 0.5)',
                  }}
                >
                  With Prompt
                </button>
                <button
                  onClick={() => setRecordMode('free')}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
                  style={{
                    background:
                      recordMode === 'free'
                        ? 'rgba(255, 255, 255, 0.2)'
                        : 'transparent',
                    color:
                      recordMode === 'free'
                        ? 'white'
                        : 'rgba(255, 255, 255, 0.5)',
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
                className="w-20 h-20 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                style={{
                  background: 'transparent',
                  border: '4px solid white',
                }}
                aria-label="Start recording"
              >
                <div
                  className="w-16 h-16 rounded-full"
                  style={{ background: '#E53E3E' }}
                />
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="w-20 h-20 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                style={{
                  background: 'transparent',
                  border: '4px solid #E53E3E',
                }}
                aria-label="Stop recording"
              >
                <div
                  className="w-8 h-8 rounded-[4px]"
                  style={{ background: '#E53E3E' }}
                />
              </button>
            )}
          </div>
        </>
      )}

      {/* ========== REVIEW PHASE ========== */}
      {phase === 'review' && recordedUrl && (
        <>
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={playbackRef}
              src={recordedUrl}
              controls
              playsInline
              className="absolute inset-0 w-full h-full"
              style={{ objectFit: 'cover', background: '#000' }}
            />
          </div>

          {/* Duration badge */}
          <div
            className="absolute top-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full z-10"
            style={{
              background: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            <span className="text-white text-sm font-medium tabular-nums">
              {formatTime(elapsedSeconds)}
            </span>
          </div>

          {/* Review Actions */}
          <div
            className="pb-28 pt-6 px-6 flex gap-4 justify-center safe-bottom relative z-40 flex-shrink-0"
            style={{
              background: 'rgba(0, 0, 0, 0.3)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            <button
              onClick={reRecord}
              className="flex-1 py-4 rounded-full text-base font-semibold transition-transform active:scale-97"
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                color: 'white',
                border: '1.5px solid rgba(255, 255, 255, 0.3)',
              }}
            >
              Re-record
            </button>
            <button
              onClick={uploadVideo}
              className="flex-1 py-4 rounded-full text-base font-semibold transition-transform active:scale-97"
              style={{
                background: 'var(--color-terracotta-gradient)',
                color: 'white',
                boxShadow: 'var(--shadow-terracotta)',
              }}
            >
              Save
            </button>
          </div>
        </>
      )}

      {/* ========== UPLOADING PHASE ========== */}
      {phase === 'uploading' && (
        <div className="flex-1 flex items-center justify-center px-8">
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
              Saving your video...
            </p>
            {/* Progress bar */}
            <div
              className="w-full h-2 rounded-full overflow-hidden"
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
            <p className="text-white/50 text-sm mt-2">{uploadProgress}%</p>
          </div>
        </div>
      )}

      {/* ========== SUCCESS PHASE ========== */}
      {phase === 'success' && (
        <div className="flex-1 flex items-center justify-center px-8">
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
        <div
          className="fixed top-8 left-4 right-4 z-50 flex justify-center"
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="px-5 py-3 rounded-2xl text-sm font-medium text-white"
            style={{
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              pointerEvents: 'auto',
            }}
          >
            {toastMessage}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
