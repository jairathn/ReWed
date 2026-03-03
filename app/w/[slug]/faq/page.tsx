'use client';

import BottomNav from '@/components/guest/BottomNav';
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
      <div className="pb-24 px-5 pt-8 max-w-lg mx-auto">
        <div className="skeleton h-8 w-40 mb-6" />
        <div className="skeleton h-20 w-full mb-3 rounded-xl" />
        <BottomNav />
      </div>
    );
  }

  const coupleName = config?.couple_names
    ? `${config.couple_names.name1} & ${config.couple_names.name2}`
    : 'the couple';

  return (
    <div className="pb-24 pt-8 max-w-lg mx-auto flex flex-col" style={{ minHeight: 'calc(100vh - 80px)' }}>
      <div className="px-5">
        <h1
          className="text-2xl font-medium mb-2"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
        >
          Questions?
        </h1>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Ask anything about {coupleName}&apos;s wedding and get an instant answer.
        </p>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-5 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-4xl mb-3">&#128173;</p>
            <p className="text-base font-medium mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
              How can I help?
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => askQuestion(q)}
                  className="px-4 py-2 rounded-full text-sm"
                  style={{ background: 'rgba(196, 112, 75, 0.08)', color: 'var(--color-terracotta)' }}
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
                background: msg.role === 'user' ? 'var(--color-terracotta)' : 'var(--bg-pure-white)',
                color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                boxShadow: msg.role === 'assistant' ? 'var(--shadow-soft)' : 'none',
                border: msg.role === 'assistant' ? '1px solid var(--border-light)' : 'none',
              }}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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
      <div className="px-5 pt-3 pb-2">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 rounded-full px-4 py-3 text-sm"
            style={{ background: 'var(--bg-pure-white)', border: '1px solid var(--border-medium)', color: 'var(--text-primary)' }}
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!inputText.trim() || sending}
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: inputText.trim() ? 'var(--color-terracotta-gradient)' : 'var(--border-light)',
              color: inputText.trim() ? 'white' : 'var(--text-tertiary)',
              border: 'none',
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
      </div>

      <BottomNav />
    </div>
  );
}
