'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';

// --- Types ---

interface Icebreaker {
  question: string;
  answer: string;
}

interface Tablemate {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  group_label: string | null;
  instagram_handle: string | null;
  seat_number: number | null;
  icebreaker: Icebreaker | null;
  is_you: boolean;
}

interface SeatingData {
  assigned: boolean;
  table_name?: string;
  seat_number?: number | null;
  tablemates?: Tablemate[];
}

// --- Avatar colors (same as directory page) ---

const avatarColors = [
  { bg: '#E8C4B8', text: '#A85D3E' }, // blush
  { bg: '#C4E8D0', text: '#4A7A5C' }, // sage
  { bg: '#D4E8F0', text: '#2B5F8A' }, // sky
  { bg: '#E8D9C4', text: '#8A7050' }, // sand
  { bg: '#D4C4E8', text: '#6A5A8A' }, // lavender
  { bg: '#E8E4C4', text: '#8A8040' }, // butter
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

// --- Icebreaker questions ---

const ICEBREAKER_QUESTIONS = [
  "What's your go-to karaoke song?",
  "Best travel destination you've been to?",
  "Pineapple on pizza: yes or no?",
  "What's your hidden talent?",
  "Morning person or night owl?",
];

function getRandomQuestion(): string {
  return ICEBREAKER_QUESTIONS[Math.floor(Math.random() * ICEBREAKER_QUESTIONS.length)];
}

// --- Helpers ---

function getDisplayName(mate: Tablemate): string {
  return mate.display_name || `${mate.first_name} ${mate.last_name}`;
}

function getInitials(mate: Tablemate): string {
  return `${mate.first_name[0] || ''}${mate.last_name[0] || ''}`;
}

// --- Fixed Header ---

function FixedHeader({ slug }: { slug: string }) {
  return (
    <header
      className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
      style={{
        background: 'linear-gradient(to bottom, rgba(250, 249, 245, 0.88) 0%, rgba(250, 249, 245, 0.5) 55%, rgba(250, 249, 245, 0) 100%)',
      }}
    >
      <div className="flex items-center gap-3">
        <BackButton href={`/w/${slug}/home`} label="" />
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
  );
}

// --- Component ---

export default function SeatingPage() {
  const { slug, isAuthenticated, isLoading: configLoading } = useWedding();
  const router = useRouter();

  const [seating, setSeating] = useState<SeatingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Icebreaker state
  const [icebreakerQuestion, setIcebreakerQuestion] = useState('');
  const [icebreakerAnswer, setIcebreakerAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Pick a random question on mount
  useEffect(() => {
    setIcebreakerQuestion(getRandomQuestion());
  }, []);

  // Auth guard
  useEffect(() => {
    if (!configLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [configLoading, isAuthenticated, router, slug]);

  // Fetch seating data
  useEffect(() => {
    if (!isAuthenticated) return;
    setLoading(true);
    fetch(`/api/v1/w/${slug}/seating`)
      .then((res) => res.json())
      .then((json) => {
        setSeating(json.data);
        // If the current user already answered, populate
        const me = json.data?.tablemates?.find((t: Tablemate) => t.is_you);
        if (me?.icebreaker) {
          setIcebreakerQuestion(me.icebreaker.question);
          setIcebreakerAnswer(me.icebreaker.answer);
          setSubmitted(true);
        }
      })
      .catch(() => setError("Couldn't pull your seat info right now."))
      .finally(() => setLoading(false));
  }, [slug, isAuthenticated]);

  // Submit icebreaker
  const handleSubmitIcebreaker = async () => {
    if (!icebreakerAnswer.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/w/${slug}/seating/icebreaker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_key: icebreakerQuestion,
          answer: icebreakerAnswer.trim(),
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        // Refresh seating data to show updated icebreaker
        const refreshRes = await fetch(`/api/v1/w/${slug}/seating`);
        const refreshJson = await refreshRes.json();
        setSeating(refreshJson.data);
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  // Separate current user from tablemates for display
  const { me, others } = useMemo(() => {
    if (!seating?.tablemates) return { me: null, others: [] };
    const meEntry = seating.tablemates.find((t) => t.is_you) || null;
    const otherEntries = seating.tablemates.filter((t) => !t.is_you);
    return { me: meEntry, others: otherEntries };
  }, [seating]);

  // --- Loading skeleton ---
  if (configLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <FixedHeader slug={slug} />
        <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1">
          <div className="skeleton h-8 w-56 mb-2 rounded" />
          <div className="skeleton h-4 w-40 mb-6 rounded" />
          <div className="skeleton h-40 w-full rounded-2xl mb-4" />
          <div className="skeleton h-24 w-full rounded-2xl mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-20 w-full rounded-2xl" />
            ))}
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <FixedHeader slug={slug} />
        <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1">
          <section className="mb-8 text-center">
            <h2
              className="text-5xl mb-3 tracking-tight"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
              }}
            >
              Your Table
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
                Hmm, that didn&rsquo;t work
              </p>
              <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
            </div>
          </section>
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {error}
            </p>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  // --- Not assigned ---
  if (!seating?.assigned) {
    return (
      <div className="min-h-screen flex flex-col">
        <FixedHeader slug={slug} />
        <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1">
          <section className="mb-8 text-center">
            <h2
              className="text-5xl mb-3 tracking-tight"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
              }}
            >
              Your Table
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
                Seats land closer to the day
              </p>
              <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
            </div>
          </section>
          <div
            className="rounded-2xl p-8 text-center mt-6"
            style={{
              background: 'var(--bg-pure-white, #fff)',
              border: '1px solid var(--border-light)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <div className="text-4xl mb-4">&#127869;</div>
            <p
              className="text-base font-medium mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              Your seat is on the way
            </p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              We&rsquo;ll show you your table (and who&rsquo;s on it) closer to the day.
            </p>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  // --- Main content ---
  return (
    <div className="min-h-screen flex flex-col">
      <FixedHeader slug={slug} />
      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1">
        <section className="mb-8 text-center">
          <h2
            className="text-5xl mb-3 tracking-tight"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            Your Table
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
              Here&rsquo;s who you&rsquo;re with
            </p>
            <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
          </div>
        </section>

        {/* Table assignment card */}
        <div
          className="rounded-2xl p-6 mb-5 text-center"
          style={{
            background: 'var(--bg-pure-white, #fff)',
            border: '1px solid var(--border-light)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--color-terracotta)' }}
          >
            You&rsquo;re at
          </p>
          <p
            className="text-3xl font-medium mb-1"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            {seating.table_name}
          </p>
          {seating.seat_number != null && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Seat {seating.seat_number}
            </p>
          )}
        </div>

        {/* Icebreaker card */}
        <div
          className="rounded-2xl p-5 mb-5"
          style={{
            background: 'var(--bg-pure-white, #fff)',
            border: '1px solid var(--border-light)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: 'var(--color-gold)' }}
          >
            Icebreaker
          </p>
          <p
            className="text-base font-medium mb-3"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            {icebreakerQuestion}
          </p>

          {submitted ? (
            <div
              className="rounded-xl px-4 py-3"
              style={{ background: 'var(--bg-muted, #f5f3f0)' }}
            >
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {icebreakerAnswer}
              </p>
              <button
                className="text-xs mt-2 font-medium"
                style={{ color: 'var(--color-terracotta)' }}
                onClick={() => setSubmitted(false)}
              >
                Change it
              </button>
            </div>
          ) : (
            <div>
              <textarea
                className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none"
                style={{
                  background: 'var(--bg-muted, #f5f3f0)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-light)',
                  fontFamily: 'var(--font-body)',
                }}
                rows={2}
                maxLength={200}
                placeholder="Say something..."
                value={icebreakerAnswer}
                onChange={(e) => setIcebreakerAnswer(e.target.value)}
              />
              <div className="flex items-center justify-between mt-2">
                <span
                  className="text-xs"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {icebreakerAnswer.length}/200
                </span>
                <button
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
                  style={{
                    background: 'var(--color-terracotta)',
                    color: '#fff',
                    opacity: icebreakerAnswer.trim() && !submitting ? 1 : 0.5,
                  }}
                  disabled={!icebreakerAnswer.trim() || submitting}
                  onClick={handleSubmitIcebreaker}
                >
                  {submitting ? 'Saving...' : 'Share'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tablemates */}
        <div className="mb-4">
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: 'var(--text-secondary)' }}
          >
            Your table ({(others.length + (me ? 1 : 0))})
          </p>

          <div className="space-y-3">
            {/* Current user first */}
            {me && (
              <TablemateCard
                mate={me}
                isYou
              />
            )}

            {/* Other tablemates */}
            {others.map((mate) => (
              <TablemateCard key={mate.id} mate={mate} />
            ))}
          </div>
        </div>

        {others.length === 0 && (
          <div
            className="rounded-2xl p-6 text-center"
            style={{
              background: 'var(--bg-pure-white, #fff)',
              border: '1px solid var(--border-light)',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Just you for now — more folks might land here soon.
            </p>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

// --- Tablemate Card ---

function TablemateCard({
  mate,
  isYou = false,
}: {
  mate: Tablemate;
  isYou?: boolean;
}) {
  const color = getAvatarColor(`${mate.first_name}${mate.last_name}`);
  const name = getDisplayName(mate);

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'var(--bg-pure-white, #fff)',
        border: isYou
          ? '1.5px solid var(--color-terracotta)'
          : '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
          style={{ background: color.bg, color: color.text }}
        >
          {getInitials(mate)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p
              className="text-sm font-medium truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {name}
            </p>
            {isYou && (
              <span
                className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{
                  background: 'var(--color-terracotta)',
                  color: '#fff',
                }}
              >
                You
              </span>
            )}
          </div>

          {mate.group_label && (
            <p
              className="text-xs truncate mt-0.5"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {mate.group_label}
            </p>
          )}

          {mate.instagram_handle && (
            <a
              href={`https://instagram.com/${mate.instagram_handle.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs mt-0.5 inline-block"
              style={{ color: 'var(--color-terracotta)' }}
            >
              @{mate.instagram_handle.replace('@', '')}
            </a>
          )}

          {mate.seat_number != null && (
            <p
              className="text-xs mt-0.5"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Seat {mate.seat_number}
            </p>
          )}
        </div>
      </div>

      {/* Icebreaker answer */}
      {mate.icebreaker && (
        <div
          className="mt-3 rounded-xl px-3 py-2.5"
          style={{ background: 'var(--bg-muted, #f5f3f0)' }}
        >
          <p
            className="text-[11px] font-medium mb-1"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {mate.icebreaker.question}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            {mate.icebreaker.answer}
          </p>
        </div>
      )}
    </div>
  );
}
