'use client';

import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';
import { useWedding } from '@/components/WeddingProvider';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const QUICK_QUESTIONS = [
  "What's the dress code?",
  'Where do I park?',
  'Is there a plus one?',
  'What time should I arrive?',
  'Where is the venue?',
  'Is it indoors or outdoors?',
];

export default function FaqPage() {
  const { config, guest, slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const askQuestion = async (question: string) => {
    if (!question.trim() || sending) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: question.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setSending(true);

    try {
      const res = await fetch(`/api/v1/w/${slug}/faq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      });
      const data = await res.json();

      const reply: ChatMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: data.data?.answer || data.error?.message || 'Something went wrong. Please try again.',
      };
      setMessages((prev) => [...prev, reply]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: 'assistant', content: "I'm having trouble connecting. Please try again in a moment." },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    askQuestion(inputText);
  };

  if (isLoading || !guest) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-warm-white)' }}>
        <header
          className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
          style={{
            background: 'rgba(250, 249, 245, 0.90)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8" />
          </div>
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
          <div className="w-8" />
        </header>
        <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1 flex flex-col">
          <div className="skeleton h-8 w-40 mb-6" />
          <div className="skeleton h-20 w-full mb-3 rounded-xl" />
        </main>
        <BottomNav />
      </div>
    );
  }

  const plannerEmail = config?.wedding_planner?.email || null;
  const plannerName = config?.wedding_planner?.name || null;
  const plannerMailto = plannerEmail
    ? `mailto:${plannerEmail}?subject=${encodeURIComponent(`Question about ${config?.display_name || 'the wedding'}`)}`
    : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-warm-white)' }}>
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
        style={{
          background: 'rgba(250, 249, 245, 0.90)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
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
          ReWed
        </h1>
        <div className="w-8" />
      </header>

      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1 flex flex-col">
        <section className="mb-6 text-center">
          <h2
            className="text-5xl mb-3 tracking-tight"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            Questions?
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
              Ask anything about the wedding
            </p>
            <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
          </div>
        </section>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div
              className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(43, 95, 138, 0.08), rgba(212, 168, 83, 0.08))',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-mediterranean-blue, #2B5F8A)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <p className="text-lg font-medium mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              How can I help?
            </p>
            <p className="text-xs mb-5" style={{ color: 'var(--text-tertiary)' }}>
              I know all the details about this wedding
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => askQuestion(q)}
                  className="px-4 py-2.5 rounded-full text-sm transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]"
                  style={{
                    background: 'var(--bg-pure-white)',
                    color: 'var(--color-terracotta)',
                    border: '1px solid rgba(196, 112, 75, 0.15)',
                    boxShadow: '0 2px 8px rgba(196, 112, 75, 0.06)',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[85%] rounded-2xl px-4 py-3"
              style={{
                background: msg.role === 'user'
                  ? 'linear-gradient(135deg, var(--color-terracotta), #D4A853)'
                  : 'var(--bg-pure-white)',
                color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                boxShadow: msg.role === 'user'
                  ? '0 4px 12px rgba(196, 112, 75, 0.2)'
                  : '0 2px 12px rgba(0,0,0,0.04)',
                border: msg.role === 'assistant' ? '1px solid var(--border-light)' : 'none',
              }}
            >
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--bg-pure-white)', boxShadow: 'var(--shadow-soft)', border: '1px solid var(--border-light)' }}>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-tertiary)', animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-tertiary)', animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-tertiary)', animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

        {/* Input Bar */}
        <div className="pt-3 pb-2">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask a question..."
              className="flex-1 rounded-full px-5 py-3 text-sm"
              style={{
                background: 'var(--bg-pure-white)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-primary)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                outline: 'none',
              }}
              disabled={sending}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || sending}
              className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                background: inputText.trim()
                  ? 'linear-gradient(135deg, var(--color-terracotta), #D4A853)'
                  : 'var(--border-light)',
                color: inputText.trim() ? 'white' : 'var(--text-tertiary)',
                border: 'none',
                boxShadow: inputText.trim() ? '0 4px 12px rgba(196, 112, 75, 0.2)' : 'none',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>

          {messages.length > 0 && messages.length < 6 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {QUICK_QUESTIONS.filter((q) => !messages.some((m) => m.role === 'user' && m.content === q))
                .slice(0, 3)
                .map((q) => (
                  <button
                    key={q}
                    onClick={() => askQuestion(q)}
                    className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap flex-shrink-0"
                    style={{ background: 'rgba(196, 112, 75, 0.08)', color: 'var(--color-terracotta)' }}
                    disabled={sending}
                  >
                    {q}
                  </button>
                ))}
            </div>
          )}

          {/* Wedding planner fallback link */}
          {plannerMailto && (
            <a
              href={plannerMailto}
              className="mt-3 flex items-center justify-center gap-2 rounded-xl px-4 py-3 transition-all duration-200 hover:shadow-md"
              style={{
                background: 'linear-gradient(135deg, rgba(212, 168, 83, 0.04), rgba(196, 112, 75, 0.04))',
                border: '1px solid rgba(212, 168, 83, 0.15)',
                textDecoration: 'none',
                fontSize: 13,
                fontFamily: 'var(--font-body)',
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
                boxShadow: '0 2px 8px rgba(212, 168, 83, 0.06)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold-dark)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span>
                Didn&apos;t get the answer you&apos;re looking for?{' '}
                <strong style={{ color: 'var(--color-gold-dark)' }}>
                  Email {plannerName ? `${plannerName}, ` : ''}our wedding planner
                </strong>
              </span>
            </a>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
