'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import type { Booking } from '@alpaca/types';

const STATUS_STYLES: Record<string, string> = {
  pending:        'bg-gray-100 text-gray-600',
  confirmed:      'bg-green-100 text-green-700',
  cancelled:      'bg-red-100 text-red-700',
  expired:        'bg-orange-100 text-orange-700',
  payment_failed: 'bg-red-100 text-red-700',
};

interface BookingDetail extends Booking {
  spotAddress: string;
  entryInstructions: string;
  spotRules: string[];
  cancellationPolicy: string;
}

export function AdminBookingsPage() {
  const { getToken } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, BookingDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    const token = await getToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/bookings?limit=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      const data = await res.json() as { bookings: Booking[] };
      setBookings(data.bookings);
    }
    setLoading(false);
  }, [getToken]);

  useEffect(() => { void fetchBookings(); }, [fetchBookings]);

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);

    // Fetch detail if not already loaded
    if (!details[id]) {
      setLoadingDetail(id);
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/bookings/${id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const detail = await res.json() as BookingDetail;
        setDetails((prev) => ({ ...prev, [id]: detail }));
      }
      setLoadingDetail(null);
    }
  }

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-gray-900">All Bookings</h1>

      {bookings.length === 0 && <p className="text-gray-400">No bookings yet.</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Booking ID</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Start</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">End</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Total</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bookings.map((b) => (
              <>
                <tr
                  key={b.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleExpand(b.id)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {new Date(b.startTime).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}{' '}
                    {new Date(b.startTime).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {new Date(b.endTime).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    ${(b.totalPrice / 100).toFixed(2)} {b.currency}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {expandedId === b.id ? '▲' : '▼'}
                  </td>
                </tr>

                {/* Expanded detail row */}
                {expandedId === b.id && (
                  <tr key={`${b.id}-detail`}>
                    <td colSpan={6} className="bg-gray-50 px-6 py-4">
                      {loadingDetail === b.id ? (
                        <p className="text-sm text-gray-400">Loading details...</p>
                      ) : details[b.id] ? (
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                          <div>
                            <span className="font-medium text-gray-500">Booking ID</span>
                            <p className="font-mono text-xs text-gray-700">{b.id}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Driver ID</span>
                            <p className="font-mono text-xs text-gray-700">{b.driverId}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Spot Address</span>
                            <p className="text-gray-700">{details[b.id]?.spotAddress}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Vehicle ID</span>
                            <p className="font-mono text-xs text-gray-700">{b.vehicleId}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Entry Instructions</span>
                            <p className="text-gray-700">{details[b.id]?.entryInstructions || '—'}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-500">Cancellation Policy</span>
                            <p className="text-gray-700">{details[b.id]?.cancellationPolicy}</p>
                          </div>
                          {b.cancellationReason && (
                            <div className="col-span-2">
                              <span className="font-medium text-gray-500">Cancellation Reason</span>
                              <p className="text-gray-700">{b.cancellationReason}</p>
                            </div>
                          )}
                          {b.stripePaymentIntentId && (
                            <div className="col-span-2">
                              <span className="font-medium text-gray-500">Payment Intent</span>
                              <p className="font-mono text-xs text-gray-700">{b.stripePaymentIntentId}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-red-500">Failed to load details.</p>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
