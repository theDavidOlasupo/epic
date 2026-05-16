'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { WhereInput } from '@/components/search/where-input';

const SPOT_TYPES = ['driveway', 'garage', 'lot', 'underground', 'other'] as const;
const VEHICLE_SIZES = ['compact', 'mid_size', 'full_size', 'suv', 'truck', 'van'] as const;

type Step = 'details' | 'location' | 'review';

interface FormData {
  title: string;
  type: string;
  pricePerHour: string;
  entryInstructions: string;
  isCovered: boolean;
  allowOvernight: boolean;
  maxVehicleSize: string;
  heightRestrictionCm: string;
  rules: string;
  address: string;
  latitude: number;
  longitude: number;
}

const EMPTY: FormData = {
  title: '',
  type: 'driveway',
  pricePerHour: '',
  entryInstructions: '',
  isCovered: false,
  allowOvernight: false,
  maxVehicleSize: '',
  heightRestrictionCm: '',
  rules: '',
  address: '',
  latitude: 0,
  longitude: 0,
};

export function ListingWizard() {
  const router = useRouter();
  const { getToken } = useAuth();
  const [step, setStep] = useState<Step>('details');
  const [form, setForm] = useState<FormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(patch: Partial<FormData>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function handleSubmit() {
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const rules = form.rules
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/parking-spots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title,
          address: form.address,
          latitude: form.latitude,
          longitude: form.longitude,
          type: form.type,
          pricePerHour: Math.round(Number(form.pricePerHour) * 100),
          entryInstructions: form.entryInstructions,
          isCovered: form.isCovered,
          allowOvernight: form.allowOvernight,
          maxVehicleSize: form.maxVehicleSize || undefined,
          heightRestrictionCm: form.heightRestrictionCm ? Number(form.heightRestrictionCm) : undefined,
          rules,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error: { message: string } };
        setError(err.error?.message ?? 'Failed to create listing');
        return;
      }

      // Auto-submit for review after creation
      const spot = await res.json() as { id: string };
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/parking-spots/${spot.id}/submit-review`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      );

      router.push('/listings');
    } finally {
      setSaving(false);
    }
  }

  // ── Step indicators ──────────────────────────────────────────────────────
  const steps: { key: Step; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'location', label: 'Location' },
    { key: 'review', label: 'Review' },
  ];

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-8 flex gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
              step === s.key ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'
            }`}>
              {i + 1}
            </div>
            <span className={`text-sm ${step === s.key ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-gray-200 mx-1">→</span>}
          </div>
        ))}
      </div>

      {/* Step 1: Details */}
      {step === 'details' && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Listing title</label>
            <input
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="e.g. Downtown Toronto Driveway"
              value={form.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Spot type</label>
              <select
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={form.type}
                onChange={(e) => update({ type: e.target.value })}
              >
                {SPOT_TYPES.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Price per hour ($)</label>
              <input
                type="number"
                min="0"
                step="0.50"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="8.00"
                value={form.pricePerHour}
                onChange={(e) => update({ pricePerHour: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Entry instructions</label>
            <textarea
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="How does the driver access the spot?"
              value={form.entryInstructions}
              onChange={(e) => update({ entryInstructions: e.target.value })}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Rules (one per line)</label>
            <textarea
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="No trucks&#10;Max 12 hours"
              value={form.rules}
              onChange={(e) => update({ rules: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Max vehicle size (optional)</label>
              <select
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={form.maxVehicleSize}
                onChange={(e) => update({ maxVehicleSize: e.target.value })}
              >
                <option value="">No restriction</option>
                {VEHICLE_SIZES.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Height restriction cm (optional)</label>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="210"
                value={form.heightRestrictionCm}
                onChange={(e) => update({ heightRestrictionCm: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isCovered}
                onChange={(e) => update({ isCovered: e.target.checked })}
              />
              Covered parking
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.allowOvernight}
                onChange={(e) => update({ allowOvernight: e.target.checked })}
              />
              Overnight allowed
            </label>
          </div>

          <Button
            className="w-full"
            onClick={() => setStep('location')}
            disabled={!form.title || !form.pricePerHour}
          >
            Next: Location →
          </Button>
        </div>
      )}

      {/* Step 2: Location */}
      {step === 'location' && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Address</label>
            <div className="mt-1 rounded-lg border border-gray-200 bg-white">
              <WhereInput
                value={form.address}
                onChange={(address, lat, lng) => update({ address, latitude: lat, longitude: lng })}
                placeholder="Enter your parking spot address"
              />
            </div>
            {form.address && (
              <p className="mt-1 text-xs text-gray-500">
                📍 {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('details')}>← Back</Button>
            <Button
              className="flex-1"
              onClick={() => setStep('review')}
              disabled={!form.address || !form.latitude}
            >
              Next: Review →
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Submit */}
      {step === 'review' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Title</span>
              <span className="font-medium">{form.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Type</span>
              <span className="font-medium">{form.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Price</span>
              <span className="font-medium">${Number(form.pricePerHour).toFixed(2)}/hr</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Address</span>
              <span className="font-medium text-right max-w-[60%]">{form.address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Covered</span>
              <span className="font-medium">{form.isCovered ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Overnight</span>
              <span className="font-medium">{form.allowOvernight ? 'Yes' : 'No'}</span>
            </div>
          </div>

          <div className="rounded-xl bg-yellow-50 p-3 text-sm text-yellow-800">
            Your listing will be submitted for admin review before going live.
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep('location')}>← Back</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Submitting...' : 'Submit for Review'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
