'use client';

import { useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';

export function FeedbackWidget() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    if (!message.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          email: email || (user?.primaryEmailAddress?.emailAddress ?? undefined),
          pageUrl: window.location.href,
          userId: undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error: { message: string } };
        setError(err.error?.message ?? 'Failed to submit');
        return;
      }

      setSubmitted(true);
      setMessage('');
      setEmail('');
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
      }, 2000);
    } catch {
      setError('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Floating button — small round icon on mobile (positioned higher), full pill on desktop */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-20 right-4 sm:bottom-5 sm:right-5 z-50 flex items-center justify-center gap-2 rounded-full bg-black text-white shadow-lg hover:bg-gray-800 transition-transform hover:scale-105 h-10 w-10 sm:h-auto sm:w-auto sm:px-4 sm:py-3"
        aria-label="Send feedback"
      >
        <span>💬</span>
        <span className="hidden sm:inline text-sm font-medium">Feedback</span>
      </button>

      {/* Popup */}
      {open && (
        <div className="fixed bottom-32 right-4 sm:bottom-20 sm:right-5 z-50 w-[calc(100%-2rem)] sm:w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
          {submitted ? (
            <div className="text-center py-6">
              <span className="text-3xl">✓</span>
              <p className="mt-2 text-sm font-medium text-gray-900">Thanks for your feedback!</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Send feedback</h3>
                <button
                  onClick={() => setOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <textarea
                rows={4}
                placeholder="What's on your mind? Bug reports, suggestions, anything..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
              />

              {!isSignedIn && (
                <input
                  type="email"
                  placeholder="Email (optional, for follow-up)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              )}

              {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={!message.trim() || submitting}
                className="mt-3 w-full rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Sending...' : 'Submit'}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
