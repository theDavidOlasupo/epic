'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
  entryInstructions: string;
  cancellationPolicy: string;
}

export function ConfirmationPage({ bookingId }: { bookingId: string }) {
  const { getToken } = useAuth();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBooking = useCallback(async () => {
    const token = await getToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/bookings/${bookingId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) setBooking(await res.json() as BookingDetail);
    setLoading(false);
  }, [bookingId, getToken]);

  useEffect(() => { void fetchBooking(); }, [fetchBooking]);

  if (loading) return <p className="text-gray-400">Loading...</p>;
  if (!booking) return <p className="text-red-500">Booking not found.</p>;

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
    <div className="space-y-6 text-center">
      {/* Success icon */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Booking confirmed!</h1>
        <p className="text-gray-500">Your parking spot is reserved.</p>
      </div>

      {/* Details */}
      <div className="rounded-xl border border-gray-200 p-4 text-left space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Address</span>
          <span className="font-medium text-gray-900 text-right max-w-[60%]">{booking.spotAddress}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Date</span>
          <span className="font-medium text-gray-900">{startDate}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Time</span>
          <span className="font-medium text-gray-900">{startHour} – {endHour}</span>
        </div>
        <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
          <span className="text-gray-500">Total paid</span>
          <span className="font-semibold text-gray-900">
            ${(booking.totalPrice / 100).toFixed(2)} {booking.currency}
          </span>
        </div>
      </div>

      {/* Entry instructions */}
      {booking.entryInstructions && (
        <div className="rounded-xl bg-blue-50 p-4 text-left">
          <p className="text-sm font-medium text-blue-900 mb-1">Entry instructions</p>
          <p className="text-sm text-blue-800">{booking.entryInstructions}</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button asChild>
          <Link href="/search">Find more parking</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/bookings">View my bookings</Link>
        </Button>
      </div>
    </div>
  );
}
