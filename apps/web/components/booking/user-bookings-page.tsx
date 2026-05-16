'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import type { Booking } from '@alpaca/types';

const STATUS_STYLES: Record<string, string> = {
  pending:        'bg-gray-100 text-gray-600',
  confirmed:      'bg-green-100 text-green-700',
  cancelled:      'bg-red-100 text-red-700',
  expired:        'bg-orange-100 text-orange-700',
  payment_failed: 'bg-red-100 text-red-700',
};

type Filter = 'upcoming' | 'past' | 'all';

export function UserBookingsPage() {
  const { getToken } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState('');

  const fetchBookings = useCallback(async (f: Filter) => {
    setLoading(true);
    const token = await getToken();
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bookings/me`);
    if (f !== 'all') url.searchParams.set('filter', f);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setBookings(await res.json() as Booking[]);
    setLoading(false);
  }, [getToken]);

  useEffect(() => { void fetchBookings(filter); }, [filter, fetchBookings]);

  async function handleCancel(bookingId: string) {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    setCancellingId(bookingId);
    setCancelError('');
    const token = await getToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/bookings/${bookingId}/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      },
    );
    if (!res.ok) {
      const err = await res.json() as { error: { message: string } };
      setCancelError(err.error?.message ?? 'Failed to cancel');
    }
    setCancellingId(null);
    await fetchBookings(filter);
  }

  const tabs: { key: Filter; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-gray-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              filter === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {cancelError && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{cancelError}</p>
      )}

      {loading && <p className="text-gray-400">Loading bookings...</p>}

      {!loading && bookings.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No {filter === 'all' ? '' : filter} bookings.</p>
          {filter === 'upcoming' && (
            <a
              href="/search"
              className="mt-3 inline-block text-sm font-medium text-gray-900 underline"
            >
              Find parking →
            </a>
          )}
        </div>
      )}

      <div className="space-y-4">
        {bookings.map((b) => {
          const startDate = new Date(b.startTime).toLocaleDateString('en-CA', {
            weekday: 'short', month: 'short', day: 'numeric',
          });
          const startHour = new Date(b.startTime).toLocaleTimeString('en-CA', {
            hour: '2-digit', minute: '2-digit',
          });
          const endHour = new Date(b.endTime).toLocaleTimeString('en-CA', {
            hour: '2-digit', minute: '2-digit',
          });
          const canCancel = ['pending', 'confirmed'].includes(b.status);

          return (
            <div key={b.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {b.status}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">{b.id.slice(0, 8)}…</span>
                  </div>
                  <p className="font-semibold text-gray-900">{startDate}</p>
                  <p className="text-sm text-gray-600">{startHour} – {endHour}</p>
                  <p className="text-sm font-medium text-gray-900">
                    ${(b.totalPrice / 100).toFixed(2)} {b.currency}
                  </p>
                  {b.cancellationReason && (
                    <p className="text-xs text-gray-400">Reason: {b.cancellationReason}</p>
                  )}
                </div>

                {canCancel && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700 shrink-0"
                    onClick={() => handleCancel(b.id)}
                    disabled={cancellingId === b.id}
                  >
                    {cancellingId === b.id ? 'Cancelling...' : 'Cancel'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
