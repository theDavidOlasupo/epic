'use client';

import { useState, useRef, useCallback } from 'react';
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

  // Drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const hasMoved = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: position.x,
      origY: position.y,
    };
    hasMoved.current = false;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved.current = true;
    setPosition({
      x: dragRef.current.origX + dx,
      y: dragRef.current.origY + dy,
    });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    setDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    // Only toggle open if it wasn't a drag
    if (!hasMoved.current) {
      setOpen((o) => !o);
    }
  }, []);

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

  const buttonStyle = {
    transform: `translate(${position.x}px, ${position.y}px)`,
    cursor: dragging ? 'grabbing' : 'grab',
  };

  const popupStyle = {
    transform: `translate(${position.x}px, ${position.y}px)`,
  };

  return (
    <>
      {/* Draggable floating button */}
      <div
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-black px-4 py-3 text-white shadow-lg select-none touch-none"
        style={buttonStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="Send feedback"
      >
        <span>💬</span>
        <span className="text-sm font-medium">Feedback</span>
      </div>

      {/* Popup — positioned relative to the button */}
      {open && (
        <div
          className="fixed bottom-[4.5rem] right-5 z-50 w-[calc(100%-2rem)] max-w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-xl"
          style={popupStyle}
        >
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
