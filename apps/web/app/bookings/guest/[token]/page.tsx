'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface GuestBooking {
  id: string;
  status: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  currency: string;
  spotAddress: string;
  entryInstructions: string;
  spotTitle: string;
}

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-600',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  expired:   'bg-orange-100 text-orange-700',
};

export default function GuestBookingPage({ params }: { params: { token: string } }) {
  const [booking, setBooking] = useState<GuestBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bookings/guest/${params.token}`)
      .then((res) => {
        if (!res.ok) { setNotFound(true); return null; }
        return res.json() as Promise<GuestBooking>;
      })
      .then((data) => { if (data) setBooking(data); })
      .finally(() => setLoading(false));
  }, [params.token]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-400">Loading booking...</p>
      </main>
    );
  }

  if (notFound || !booking) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-lg font-medium text-gray-700">Booking not found</p>
        <p className="text-sm text-gray-400">This link may have expired or is invalid.</p>
        <Button asChild><Link href="/search">Find parking</Link></Button>
      </main>
    );
  }

  const startDate = new Date(booking.startTime).toLocaleDateString('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const startHour = new Date(booking.startTime).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
  const endHour = new Date(booking.endTime).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 text-center">
        {booking.status === 'confirmed' ? (
          <>
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">✓</div>
            <h1 className="text-2xl font-bold text-gray-900">Booking confirmed!</h1>
            <p className="mt-1 text-gray-500">Your parking spot is reserved.</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900">Your Booking</h1>
            <span className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-medium ${STATUS_STYLES[booking.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {booking.status}
            </span>
          </>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">Spot</span><span className="font-medium text-gray-900 text-right max-w-[60%]">{booking.spotTitle}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Address</span><span className="font-medium text-gray-900 text-right max-w-[60%]">{booking.spotAddress}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Date</span><span className="font-medium text-gray-900">{startDate}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Time</span><span className="font-medium text-gray-900">{startHour} – {endHour}</span></div>
        <div className="flex justify-between border-t border-gray-100 pt-2">
          <span className="text-gray-500">Total paid</span>
          <span className="font-semibold text-gray-900">${(booking.totalPrice / 100).toFixed(2)} {booking.currency}</span>
        </div>
      </div>

      {booking.entryInstructions && booking.status === 'confirmed' && (
        <div className="mt-4 rounded-xl bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-900 mb-1">Entry instructions</p>
          <p className="text-sm text-blue-800">{booking.entryInstructions}</p>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="font-semibold text-gray-900 mb-1">Save your booking history</p>
        <p className="text-sm text-gray-600 mb-3">Create a free account to access your bookings anytime and check out faster next time.</p>
        <Button asChild className="w-full">
          <Link href={`/sign-up?guestToken=${params.token}`}>Create Account</Link>
        </Button>
        <p className="mt-2 text-center text-xs text-gray-400">
          Already have an account?{' '}
          <Link href="/sign-in" className="underline">Sign in</Link>
        </p>
      </div>

      <div className="mt-4">
        <Button variant="outline" asChild className="w-full">
          <Link href="/search">Find more parking</Link>
        </Button>
      </div>
    </main>
  );
}
