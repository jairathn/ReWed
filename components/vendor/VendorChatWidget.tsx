'use client';

import { useState, useEffect, useRef } from 'react';

type Role = 'user' | 'assistant';

interface Message {
  id: string;
  role: Role;
  content: string;
}

interface Props {
  slug: string;
  token: string;
}

const STORAGE_KEY_PREFIX = 'zari-vendor-chat-';

const SUGGESTED_PROMPTS = [
  'What time should I arrive?',
  'Who am I coordinating with?',
  'Which items are hard deadlines?',
  'What should I bring or prep beforehand?',
];

/**
 * Floating question bubble for vendors — mirrors ExpertChatWidget on the
 * couple side so a vendor can ask "what time for X?" without leaving the
 * timeline. The backend endpoint answers one question at a time (no server
 * memory), but we render the conversation as bubbles so it feels like a chat
 * and the vendor can scroll back to answers they already got today.
 */
export default function VendorChatWidget({ slug, token }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const storageKey = `${STORAGE_KEY_PREFIX}${slug}-${token}`;

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Message[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      // ignore corrupt storage
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // ignore quota errors
    }
  }, [messages, storageKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const ask = async (prompt?: string) => {
    const question = (prompt ?? input).trim();
    if (!question || sending) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);
    setError('');

    try {
      const res = await fetch(`/api/v1/v/${slug}/${token}/faq`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Could not get an answer');
      setRemaining(data.data?.remaining ?? null);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.data?.answer || "I couldn't put together an answer.",
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setError('');
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask about your role"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
          color: '#FDFBF7',
          boxShadow: '0 8px 24px rgba(198, 163, 85, 0.35)',
          cursor: 'pointer',
          zIndex: 90,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 'min(420px, calc(100vw - 40px))',
        height: 'min(580px, calc(100vh - 40px))',
        background: 'var(--bg-pure-white)',
        border: '1px solid var(--border-light)',
        borderRadius: 18,
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.18)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 90,
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--border-light)',
          background: 'var(--bg-pure-white)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 16,
              fontWeight: 500,
              color: 'var(--text-primary)',
              lineHeight: 1.2,
            }}
          >
            Ask about your role
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-body)', marginTop: 2 }}>
            Knows your timeline, contacts, and the couple&apos;s notes.
            {remaining !== null && ` · ${remaining} left today`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {messages.length > 0 && (
            <button
              onClick={clearConversation}
              style={iconButton}
              title="Clear"
              aria-label="Clear conversation"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
              </svg>
            </button>
          )}
          <button onClick={() => setOpen(false)} style={iconButton} title="Minimize" aria-label="Minimize">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 14,
          background: 'var(--bg-warm-gradient)',
        }}
      >
        {messages.length === 0 && !sending && (
          <div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.55 }}>
              Quick question? I have your assigned items, who you&apos;re coordinating with, and any notes the couple left.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => ask(p)}
                  style={{
                    textAlign: 'left',
                    padding: '9px 12px',
                    borderRadius: 12,
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-pure-white)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontFamily: 'var(--font-body)',
                    cursor: 'pointer',
                    lineHeight: 1.4,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} content={m.content} />
        ))}

        {sending && <Bubble role="assistant" content="…" muted />}
      </div>

      <div style={{ borderTop: '1px solid var(--border-light)', padding: 12, background: 'var(--bg-pure-white)' }}>
        {error && (
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: 'rgba(196, 112, 75, 0.08)',
              color: 'var(--color-terracotta)',
              fontSize: 12,
              fontFamily: 'var(--font-body)',
              marginBottom: 8,
            }}
          >
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            rows={2}
            placeholder="Ask anything about your role…"
            value={input}
            disabled={sending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            style={{
              flex: 1,
              resize: 'none',
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid var(--border-light)',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
              color: 'var(--text-primary)',
              outline: 'none',
              background: 'var(--bg-pure-white)',
            }}
          />
          <button
            onClick={() => ask()}
            disabled={sending || !input.trim()}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              background:
                sending || !input.trim()
                  ? 'var(--border-light)'
                  : 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))',
              color: sending || !input.trim() ? 'var(--text-tertiary)' : '#FDFBF7',
              fontSize: 13,
              fontWeight: 500,
              fontFamily: 'var(--font-body)',
              cursor: sending || !input.trim() ? 'default' : 'pointer',
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, content, muted }: { role: Role; content: string; muted?: boolean }) {
  const isUser = role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
      <div
        style={{
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: 14,
          background: isUser
            ? 'linear-gradient(135deg, var(--color-gold-dark), var(--color-gold))'
            : 'var(--bg-pure-white)',
          color: isUser ? '#FDFBF7' : 'var(--text-primary)',
          border: isUser ? 'none' : '1px solid var(--border-light)',
          fontSize: 13,
          fontFamily: 'var(--font-body)',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          opacity: muted ? 0.6 : 1,
          fontStyle: muted ? 'italic' : 'normal',
        }}
      >
        {content}
      </div>
    </div>
  );
}

const iconButton: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: 'none',
  background: 'transparent',
  color: 'var(--text-tertiary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
