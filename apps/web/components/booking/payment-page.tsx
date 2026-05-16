'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';

interface BookingDetail {
  id: string;
  totalPrice: number;
  currency: string;
  startTime: string;
  endTime: string;
  status: string;
  spotAddress: string;
  cancellationPolicy: string;
}

export function PaymentPage({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  const fetchBooking = useCallback(async () => {
    const token = await getToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/bookings/${bookingId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      setBooking(await res.json() as BookingDetail);
    }
    setLoading(false);
  }, [bookingId, getToken]);

  useEffect(() => { void fetchBooking(); }, [fetchBooking]);

  async function handlePay() {
    setPaying(true);
    setError('');
    try {
      const token = await getToken();

      // 1. Create payment intent
      const intentRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/create-intent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bookingId }),
        },
      );

      if (!intentRes.ok) {
        const err = await intentRes.json() as { error: { message: string } };
        setError(err.error?.message ?? 'Payment failed');
        return;
      }

      const { paymentIntentId } = await intentRes.json() as { paymentIntentId: string; clientSecret: string };

      // 2. Simulate Stripe webhook (stub — in production Stripe calls this automatically)
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: paymentIntentId,
              metadata: { bookingId },
            },
          },
        }),
      });

      // 3. Navigate to confirmation
      router.push(`/bookings/${bookingId}/confirmation`);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return <p className="text-gray-400">Loading booking details...</p>;
  }

  if (!booking) {
    return <p className="text-red-500">Booking not found.</p>;
  }

  const startDate = new Date(booking.startTime).toLocaleDateString('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const startHour = new Date(booking.startTime).toLocaleTimeString('en-CA', {
    hour: '2-digit', minute: '2-digit',
  });
  const endHour = new Date(booking.endTime).toLocaleTimeString('en-CA', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="space-y-6">
      {/* Booking summary */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-2">
        <h2 className="font-semibold text-gray-900">Booking summary</h2>
        <p className="text-sm text-gray-600">{booking.spotAddress}</p>
        <div className="text-sm text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>Date</span>
            <span className="font-medium text-gray-900">{startDate}</span>
          </div>
          <div className="flex justify-between">
            <span>Time</span>
            <span className="font-medium text-gray-900">{startHour} – {endHour}</span>
          </div>
          <div className="flex justify-between border-t border-gray-100 pt-2 mt-2">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="font-semibold text-gray-900">
              ${(booking.totalPrice / 100).toFixed(2)} {booking.currency}
            </span>
          </div>
        </div>
      </div>

      {/* Cancellation policy */}
      <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-900 mb-1">Cancellation policy</p>
        <p>Free cancellation if you cancel more than 1 hour before your booking starts.</p>
      </div>

      {/* Payment — stub UI (replace with Stripe Elements in production) */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="font-semibold text-gray-900">Payment details</h2>
        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500 text-center">
          🔒 Stripe payment form will appear here in production
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button className="w-full" onClick={handlePay} disabled={paying}>
        {paying ? 'Processing...' : `Pay $${(booking.totalPrice / 100).toFixed(2)}`}
      </Button>

      <p className="text-center text-xs text-gray-400">
        By confirming, you agree to the cancellation policy above.
      </p>
    </div>
  );
}
