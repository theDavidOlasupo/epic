'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface WhenPickerProps {
  startTime: string;
  endTime: string;
  onChange: (startTime: string, endTime: string) => void;
}

// Generate 30-minute time slots for a given date
function timeSlots() {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}

// Today's date in YYYY-MM-DD
function today() {
  return new Date().toISOString().split('T')[0] ?? '';
}

export function WhenPicker({ startTime, endTime, onChange }: WhenPickerProps) {
  const [open, setOpen] = useState(false);

  const startDate = startTime ? startTime.split('T')[0] : today();
  const startHour = startTime ? startTime.split('T')[1]?.slice(0, 5) : '09:00';
  const endDate = endTime ? endTime.split('T')[0] : today();
  const endHour = endTime ? endTime.split('T')[1]?.slice(0, 5) : '11:00';

  function update(sd: string, sh: string, ed: string, eh: string) {
    onChange(`${sd}T${sh}:00Z`, `${ed}T${eh}:00Z`);
  }

  const displayText =
    startTime && endTime
      ? `${startDate} ${startHour} → ${endHour}`
      : 'Date · Time';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-full w-full items-center gap-2 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50"
      >
        <span className="text-gray-400">📅</span>
        <span className={startTime ? 'text-gray-900' : 'text-gray-400'}>{displayText}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Date</label>
              <input
                type="date"
                min={today()}
                value={startDate}
                onChange={(e) => update(e.target.value, startHour ?? '09:00', e.target.value, endHour ?? '11:00')}
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500">From</label>
                <select
                  value={startHour}
                  onChange={(e) => update(startDate ?? today(), e.target.value, endDate ?? today(), endHour ?? '11:00')}
                  className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                >
                  {timeSlots().map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500">To</label>
                <select
                  value={endHour}
                  onChange={(e) => update(startDate ?? today(), startHour ?? '09:00', endDate ?? today(), e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                >
                  {timeSlots().map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <Button className="w-full" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}
