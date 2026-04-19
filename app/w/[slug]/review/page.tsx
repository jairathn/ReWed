'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

type Phase = 'review' | 'uploading' | 'success';

function ReviewContent() {
  const { guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [phase, setPhase] = useState<Phase>('review');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  // Retrieve captured media from sessionStorage (set by photo/video pages)
  useEffect(() => {
    const type = searchParams.get('type') as 'photo' | 'video' | null;
    if (type) {
      setMediaType(type);
    }

    const storedKey = `review_media_${slug}`;
    const storedMeta = sessionStorage.getItem(storedKey);

    if (storedMeta) {
      try {
        const meta = JSON.parse(storedMeta);
        setMediaType(meta.type || 'photo');

        // Retrieve the blob from the stored base64
        if (meta.dataUrl) {
          setMediaUrl(meta.dataUrl);

          // Convert data URL to blob for upload
          fetch(meta.dataUrl)
            .then((res) => res.blob())
            .then((blob) => setMediaBlob(blob))
            .catch(() => setLoadError(true));
        } else {
          setLoadError(true);
        }
      } catch {
        setLoadError(true);
      }
    } else {
      setLoadError(true);
    }
  }, [searchParams, slug]);

  const goBack = () => {
    const storedKey = `review_media_${slug}`;
    sessionStorage.removeItem(storedKey);
    router.push(`/w/${slug}/${mediaType === 'video' ? 'video' : 'photo'}`);
  };

  const saveToGallery = async () => {
    if (!mediaBlob || !guest) return;

    setPhase('uploading');
    setUploadProgress(0);

    const mimeType =
      mediaType === 'video'
        ? mediaBlob.type.includes('mp4')
          ? 'video/mp4'
          : 'video/webm'
        : 'image/jpeg';

    try {
      // Step 1: Get presigned URL
      const presignRes = await fetch(`/api/v1/w/${slug}/upload/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: mediaType,
          mime_type: mimeType,
          size_bytes: mediaBlob.size,
        }),
      });

      if (!presignRes.ok) {
        throw new Error('Failed to get upload URL');
      }

      const presignData = await presignRes.json();
      const { upload_id, presigned_url, storage_key } = presignData.data;
      setUploadProgress(15);

      // Step 2: Upload blob
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
        xhr.send(mediaBlob);
      });

      setUploadProgress(85);

      // Step 3: Complete upload
      const completeRes = await fetch(`/api/v1/w/${slug}/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_id,
          storage_key,
        }),
      });

      if (!completeRes.ok) {
        throw new Error('Failed to complete upload');
      }

      setUploadProgress(100);
      setPhase('success');

      // Clean up sessionStorage
      sessionStorage.removeItem(`review_media_${slug}`);

      // Auto-redirect to gallery after 2 seconds
      setTimeout(() => {
        router.push(`/w/${slug}/gallery`);
      }, 2000);
    } catch (err) {
      console.error('Upload failed:', err);
      setPhase('review');
      setUploadProgress(0);
    }
  };

  // Loading skeleton
  if (isLoading || !guest) {
    return (
      <div className="min-h-screen flex flex-col">
        <header
          className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
          style={{
            background: 'linear-gradient(to bottom, rgba(250, 249, 245, 0.88) 0%, rgba(250, 249, 245, 0.5) 55%, rgba(250, 249, 245, 0) 100%)',
          }}
        >
          <div className="flex items-center gap-3">
            <BackButton href={`/w/${slug}/capture`} label="" />
          </div>
          <h1
            className="text-2xl tracking-wide"
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              color: 'var(--color-gold-dark)',
            }}
          >
            Zari
          </h1>
          <div className="w-8" />
        </header>
        <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1 flex flex-col">
          <div className="skeleton h-8 w-40 mb-6" />
          <div className="skeleton aspect-[3/4] w-full rounded-2xl mb-6" />
          <div className="flex gap-4">
            <div className="skeleton h-14 flex-1 rounded-full" />
            <div className="skeleton h-14 flex-1 rounded-full" />
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  // No media to review
  if (loadError && phase === 'review') {
    return (
      <div className="min-h-screen flex flex-col">
        <header
          className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
          style={{
            background: 'linear-gradient(to bottom, rgba(250, 249, 245, 0.88) 0%, rgba(250, 249, 245, 0.5) 55%, rgba(250, 249, 245, 0) 100%)',
          }}
        >
          <div className="flex items-center gap-3">
            <BackButton href={`/w/${slug}/capture`} label="" />
          </div>
          <h1
            className="text-2xl tracking-wide"
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              color: 'var(--color-gold-dark)',
            }}
          >
            Zari
          </h1>
          <div className="w-8" />
        </header>
        <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1 flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
              style={{ background: 'var(--bg-soft-cream)' }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <h2
              className="text-xl font-medium mb-3"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
              }}
            >
              Nothing to look at yet
            </h2>
            <p className="text-sm mb-8 text-center" style={{ color: 'var(--text-secondary)' }}>
              Grab a photo or a video first, then circle back here to save it.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => router.push(`/w/${slug}/photo`)}
                className="btn-primary px-6"
              >
                Take a photo
              </button>
              <button
                onClick={() => router.push(`/w/${slug}/video`)}
                className="btn-secondary px-6"
              >
                Record a video
              </button>
            </div>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
        style={{
          background: 'linear-gradient(to bottom, rgba(250, 249, 245, 0.88) 0%, rgba(250, 249, 245, 0.5) 55%, rgba(250, 249, 245, 0) 100%)',
        }}
      >
        <div className="flex items-center gap-3">
          <BackButton href={`/w/${slug}/capture`} label="" />
        </div>
        <h1
          className="text-2xl tracking-wide"
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            color: 'var(--color-gold-dark)',
          }}
        >
          Zari
        </h1>
        <div className="w-8" />
      </header>
      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1 flex flex-col">
      {/* ========== REVIEW PHASE ========== */}
      {phase === 'review' && (
        <>
          <section className="mb-6 text-center">
            <h2
              className="text-5xl mb-3 tracking-tight"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
              }}
            >
              Review
            </h2>
            <div className="flex items-center justify-center gap-3">
              <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
              <p
                className="text-lg"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  color: 'var(--color-terracotta)',
                }}
              >
                Look good?
              </p>
              <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
            </div>
          </section>

          {/* Media Preview */}
          <div
            className="relative overflow-hidden rounded-2xl mb-6 flex-1"
            style={{
              background: '#1a1a1a',
              maxHeight: '60vh',
              minHeight: '300px',
            }}
          >
            {mediaType === 'photo' && mediaUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={mediaUrl}
                alt="Captured photo for review"
                className="w-full h-full rounded-2xl"
                style={{ objectFit: 'cover' }}
              />
            )}
            {mediaType === 'video' && mediaUrl && (
              <video
                src={mediaUrl}
                controls
                playsInline
                className="w-full h-full rounded-2xl"
                style={{ objectFit: 'cover', background: '#000' }}
              />
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 mt-auto">
            <button
              onClick={goBack}
              className="btn-secondary flex-1 py-4"
            >
              Redo
            </button>
            <button
              onClick={saveToGallery}
              disabled={!mediaBlob}
              className="btn-primary flex-1 py-4"
              style={{
                opacity: mediaBlob ? 1 : 0.5,
              }}
            >
              Save it
            </button>
          </div>
        </>
      )}

      {/* ========== UPLOADING PHASE ========== */}
      {phase === 'uploading' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-xs text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'var(--bg-soft-cream)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-terracotta)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p
              className="text-base font-medium mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              Tucking it away...
            </p>
            {/* Progress bar */}
            <div
              className="w-full h-2 rounded-full overflow-hidden"
              style={{ background: 'var(--bg-soft-cream)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${uploadProgress}%`,
                  background: 'var(--color-terracotta-gradient)',
                }}
              />
            </div>
            <p className="text-sm mt-2" style={{ color: 'var(--text-tertiary)' }}>
              {uploadProgress}%
            </p>
          </div>
        </div>
      )}

      {/* ========== SUCCESS PHASE ========== */}
      {phase === 'success' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            {/* Animated checkmark */}
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{
                background: 'rgba(122, 139, 92, 0.12)',
                border: '2px solid var(--color-olive)',
                animation: 'checkmark-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
              }}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-olive)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: 24,
                  strokeDashoffset: 24,
                  animation: 'checkmark-draw 0.5s ease 0.3s forwards',
                }}
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2
              className="text-2xl font-medium mb-2"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
              }}
            >
              Got it.
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Taking you to your gallery...
            </p>
          </div>
        </div>
      )}

      </main>
      <BottomNav />

      {/* Inline keyframes for success animation */}
      <style jsx>{`
        @keyframes checkmark-pop {
          0% {
            transform: scale(0.5);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes checkmark-draw {
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col">
          <header
            className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
            style={{
              background: 'linear-gradient(to bottom, rgba(250, 249, 245, 0.88) 0%, rgba(250, 249, 245, 0.5) 55%, rgba(250, 249, 245, 0) 100%)',
            }}
          >
            <div className="w-8" />
            <h1
              className="text-2xl tracking-wide"
              style={{
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                color: 'var(--color-gold-dark)',
              }}
            >
              Zari
            </h1>
            <div className="w-8" />
          </header>
          <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1 flex flex-col">
            <div className="skeleton h-8 w-40 mb-6" />
            <div className="skeleton aspect-[3/4] w-full rounded-2xl mb-6" />
            <div className="flex gap-4">
              <div className="skeleton h-14 flex-1 rounded-full" />
              <div className="skeleton h-14 flex-1 rounded-full" />
            </div>
          </main>
          <BottomNav />
        </div>
      }
    >
      <ReviewContent />
    </Suspense>
  );
}
