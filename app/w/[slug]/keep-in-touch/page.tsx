'use client';

import { useWedding } from '@/components/WeddingProvider';
import BottomNav from '@/components/guest/BottomNav';
import BackButton from '@/components/guest/BackButton';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface ContactGuest {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  group_label: string | null;
}

interface ContactShare {
  id: string;
  guest: ContactGuest;
  instagram_handle: string | null;
  phone: string | null;
  email: string | null;
  share_message: string | null;
  is_you: boolean;
}

interface MyShare {
  instagram_handle: string | null;
  phone: string | null;
  email: string | null;
  share_message: string | null;
}

const avatarColors = [
  { bg: '#E8C4B8', text: '#A85D3E' },
  { bg: '#C4E8D0', text: '#4A7A5C' },
  { bg: '#D4E8F0', text: '#2B5F8A' },
  { bg: '#E8D9C4', text: '#8A7050' },
  { bg: '#D4C4E8', text: '#6A5A8A' },
  { bg: '#E8E4C4', text: '#8A8040' },
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export default function KeepInTouchPage() {
  const { slug, isAuthenticated, isLoading } = useWedding();
  const router = useRouter();

  const [contacts, setContacts] = useState<ContactShare[]>([]);
  const [myShare, setMyShare] = useState<MyShare | null>(null);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Form state
  const [instagram, setInstagram] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/w/${slug}`);
    }
  }, [isLoading, isAuthenticated, router, slug]);

  const fetchContacts = useCallback(async () => {
    try {
      setLoadingContacts(true);
      const res = await fetch(`/api/v1/w/${slug}/keep-in-touch`);
      const data = await res.json();
      if (data.data) {
        setContacts(data.data.contacts);
        setMyShare(data.data.my_share);
        if (data.data.my_share) {
          setInstagram(data.data.my_share.instagram_handle || '');
          setPhone(data.data.my_share.phone || '');
          setEmail(data.data.my_share.email || '');
          setMessage(data.data.my_share.share_message || '');
        }
      }
    } catch {
      setFetchError("Couldn't pull the contacts — try again?");
    } finally {
      setLoadingContacts(false);
    }
  }, [slug]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchContacts();
    }
  }, [isAuthenticated, fetchContacts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!instagram.trim() && !phone.trim() && !email.trim()) {
      setSubmitError('Add at least one way for folks to reach you.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/w/${slug}/keep-in-touch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instagram_handle: instagram.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          share_message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error?.message || "Something didn't work.");
        return;
      }
      setEditing(false);
      await fetchContacts();
    } catch {
      setSubmitError("Couldn't save that — give it another go.");
    } finally {
      setSubmitting(false);
    }
  };

  const otherContacts = contacts.filter((c) => !c.is_you);

  if (isLoading || loadingContacts) {
    return (
      <div className="min-h-screen flex flex-col">
        <header
          className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
          style={{
            background: 'rgba(250, 249, 245, 0.55)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 0.5px 0 rgba(208, 197, 175, 0.25)',
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
        <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1">
          <section className="mb-8 text-center">
            <div className="skeleton h-12 w-56 mx-auto mb-3" style={{ borderRadius: '8px' }} />
            <div className="skeleton h-5 w-40 mx-auto" style={{ borderRadius: '8px' }} />
          </section>
          <div
            className="skeleton mb-6"
            style={{ height: '220px', width: '100%', borderRadius: '16px' }}
          />
          <div className="skeleton h-6 w-48 mb-4" style={{ borderRadius: '8px' }} />
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton mb-3"
              style={{ height: '100px', width: '100%', borderRadius: '16px' }}
            />
          ))}
        </main>
        <BottomNav />
      </div>
    );
  }

  const showForm = !myShare || editing;

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4"
        style={{
          background: 'rgba(250, 249, 245, 0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 0.5px 0 rgba(208, 197, 175, 0.25)',
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
      <main className="pt-24 pb-32 px-6 max-w-2xl mx-auto flex-1">

      {/* Header */}
      <section className="mb-8 text-center">
        <h2
          className="text-5xl mb-3 tracking-tight"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--text-primary)',
          }}
        >
          Keep in touch
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
            Swap info before you go
          </p>
          <span className="h-px w-8" style={{ background: 'var(--border-light)' }} />
        </div>
      </section>

      {fetchError && (
        <div
          style={{
            padding: '12px 16px',
            background: '#FEF2F2',
            borderRadius: '12px',
            color: '#B91C1C',
            fontSize: '14px',
            marginBottom: '16px',
          }}
        >
          {fetchError}
        </div>
      )}

      {/* Share form or success card */}
      {showForm ? (
        <div
          style={{
            background: 'white',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            boxShadow: 'var(--shadow-soft)',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <h2
            className="text-lg font-medium mb-1"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            {myShare ? 'Update your info' : 'Leave your info'}
          </h2>
          <p
            className="text-xs mb-4"
            style={{ color: 'var(--text-tertiary)', lineHeight: '1.5' }}
          >
            You pick what to share. Only other guests who&apos;ve opted in can see it.
          </p>

          <form onSubmit={handleSubmit}>
            {/* Instagram */}
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Instagram
            </label>
            <div
              className="flex items-center mb-3"
              style={{
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            >
              <span
                className="text-sm font-medium"
                style={{
                  padding: '10px 0 10px 12px',
                  color: 'var(--text-tertiary)',
                  userSelect: 'none',
                }}
              >
                @
              </span>
              <input
                type="text"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="yourhandle"
                maxLength={100}
                className="flex-1 text-sm outline-none"
                style={{
                  padding: '10px 12px 10px 4px',
                  color: 'var(--text-primary)',
                  background: 'transparent',
                  border: 'none',
                  fontFamily: 'var(--font-body)',
                }}
              />
            </div>

            {/* Phone */}
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              maxLength={30}
              className="block w-full text-sm outline-none mb-3"
              style={{
                padding: '10px 12px',
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            />

            {/* Email */}
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              maxLength={255}
              className="block w-full text-sm outline-none mb-3"
              style={{
                padding: '10px 12px',
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            />

            {/* Message */}
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Personal message (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="It was so great meeting you!"
              maxLength={500}
              rows={2}
              className="block w-full text-sm outline-none mb-4 resize-none"
              style={{
                padding: '10px 12px',
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            />

            {submitError && (
              <p
                className="text-xs mb-3"
                style={{ color: '#B91C1C' }}
              >
                {submitError}
              </p>
            )}

            <div className="flex gap-2">
              {editing && (
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 text-sm font-medium transition-opacity active:opacity-70"
                  style={{
                    padding: '12px',
                    borderRadius: '999px',
                    border: '1px solid var(--border-light)',
                    background: 'white',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 text-sm font-medium transition-opacity active:opacity-70"
                style={{
                  padding: '12px',
                  borderRadius: '999px',
                  background: 'var(--color-terracotta)',
                  color: 'white',
                  border: 'none',
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting
                  ? 'Saving...'
                  : myShare
                    ? 'Update it'
                    : 'Share it'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Success card showing shared info */
        <div
          style={{
            background: 'white',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            boxShadow: 'var(--shadow-soft)',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-lg font-medium"
              style={{
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
              }}
            >
              What you&rsquo;ve shared
            </h2>
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-medium transition-opacity active:opacity-70"
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                border: '1px solid var(--border-light)',
                background: 'white',
                color: 'var(--color-terracotta)',
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {myShare.instagram_handle && (
              <div className="flex items-center gap-2 text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
                <span style={{ color: 'var(--text-primary)' }}>@{myShare.instagram_handle}</span>
              </div>
            )}
            {myShare.phone && (
              <div className="flex items-center gap-2 text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span style={{ color: 'var(--text-primary)' }}>{myShare.phone}</span>
              </div>
            )}
            {myShare.email && (
              <div className="flex items-center gap-2 text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <span style={{ color: 'var(--text-primary)' }}>{myShare.email}</span>
              </div>
            )}
            {myShare.share_message && (
              <p
                className="text-sm mt-1"
                style={{
                  color: 'var(--text-secondary)',
                  fontStyle: 'italic',
                }}
              >
                &ldquo;{myShare.share_message}&rdquo;
              </p>
            )}
          </div>
        </div>
      )}

      {/* Other contacts section */}
      {otherContacts.length > 0 && (
        <>
          <h2
            className="text-lg font-medium mb-3"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--text-primary)',
            }}
          >
            Others staying in touch{' '}
            <span
              className="text-sm font-normal"
              style={{ color: 'var(--text-tertiary)' }}
            >
              ({otherContacts.length})
            </span>
          </h2>

          <div className="flex flex-col gap-3">
            {otherContacts.map((contact) => {
              const color = getAvatarColor(
                contact.guest.first_name + contact.guest.last_name
              );
              const initials = getInitials(
                contact.guest.first_name,
                contact.guest.last_name
              );

              return (
                <div
                  key={contact.id}
                  style={{
                    background: 'white',
                    borderRadius: '16px',
                    border: '1px solid var(--border-light)',
                    boxShadow: 'var(--shadow-soft)',
                    padding: '16px',
                  }}
                >
                  {/* Avatar + name row */}
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: color.bg,
                        color: color.text,
                        fontWeight: 600,
                        fontSize: '14px',
                        fontFamily: 'var(--font-body)',
                      }}
                    >
                      {initials}
                    </div>
                    <div>
                      <p
                        className="text-sm font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {contact.guest.display_name ||
                          `${contact.guest.first_name} ${contact.guest.last_name}`}
                      </p>
                      {contact.guest.group_label && (
                        <p
                          className="text-xs"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {contact.guest.group_label}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Contact details */}
                  <div className="flex flex-col gap-1.5 ml-[52px]">
                    {contact.instagram_handle && (
                      <a
                        href={`https://instagram.com/${contact.instagram_handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm transition-opacity active:opacity-70"
                        style={{ color: 'var(--color-terracotta)' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                        </svg>
                        @{contact.instagram_handle}
                      </a>
                    )}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-2 text-sm transition-opacity active:opacity-70"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        {contact.phone}
                      </a>
                    )}
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-2 text-sm transition-opacity active:opacity-70"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                        {contact.email}
                      </a>
                    )}
                    {contact.share_message && (
                      <p
                        className="text-xs mt-1"
                        style={{
                          color: 'var(--text-secondary)',
                          fontStyle: 'italic',
                          lineHeight: '1.5',
                        }}
                      >
                        &ldquo;{contact.share_message}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Empty state when no other contacts */}
      {!loadingContacts && otherContacts.length === 0 && myShare && (
        <div
          className="text-center py-8"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <p className="text-sm">
            You&apos;re the first. Others will show up as they opt in.
          </p>
        </div>
      )}

      </main>
      <BottomNav />
    </div>
  );
}
