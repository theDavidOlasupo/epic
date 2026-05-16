'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { WhenPicker } from '@/components/search/when-picker';

interface BookingWidgetProps {
  spotId: string;
  pricePerHour: number;
  initialStartTime?: string;
  initialEndTime?: string;
  compact?: boolean;
}

export function BookingWidget({
  spotId,
  pricePerHour,
  initialStartTime,
  initialEndTime,
  compact = false,
}: BookingWidgetProps) {
  const router = useRouter();
  const [startTime, setStartTime] = useState(initialStartTime ?? '');
  const [endTime, setEndTime] = useState(initialEndTime ?? '');

  const durationHours =
    startTime && endTime
      ? (new Date(endTime).getTime() - new Date(startTime).getTime()) / (1000 * 60 * 60)
      : 0;
  const totalPrice = durationHours > 0 ? Math.ceil(pricePerHour * durationHours) : 0;

  function handleReserve() {
    if (!startTime || !endTime) return;
    const params = new URLSearchParams({ spotId, startTime, endTime });
    router.push(`/bookings/new?${params.toString()}`);
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex-1 text-sm text-gray-500">
          {totalPrice > 0
            ? `$${(totalPrice / 100).toFixed(2)} total`
            : `$${(pricePerHour / 100).toFixed(2)}/hr`}
        </div>
        <Button onClick={handleReserve} disabled={!startTime || !endTime}>
          Reserve
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 p-5 shadow-sm">
      <p className="mb-4 text-lg font-semibold text-gray-900">
        ${(pricePerHour / 100).toFixed(2)}
        <span className="text-sm font-normal text-gray-500"> / hr</span>
      </p>

      <WhenPicker
        startTime={startTime}
        endTime={endTime}
        onChange={(s, e) => { setStartTime(s); setEndTime(e); }}
      />

      {durationHours > 0 && (
        <div className="mt-3 flex justify-between text-sm text-gray-600">
          <span>{durationHours.toFixed(1)} hours</span>
          <span className="font-semibold">${(totalPrice / 100).toFixed(2)} total</span>
        </div>
      )}

      <Button
        className="mt-4 w-full"
        onClick={handleReserve}
        disabled={!startTime || !endTime}
      >
        Reserve
      </Button>

      <p className="mt-2 text-center text-xs text-gray-400">You won't be charged yet</p>
    </div>
  );
}
