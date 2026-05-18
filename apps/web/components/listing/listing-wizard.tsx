'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { WhereInput } from '@/components/search/where-input';
import { PhotoUploader } from './photo-uploader';
import { AvailabilityEditor } from './availability-editor';
import type { AvailabilityRule, AvailabilityBlock } from '@alpaca/types';

const SPOT_TYPES = ['driveway', 'garage', 'lot', 'underground', 'other'] as const;
const VEHICLE_SIZES = ['compact', 'mid_size', 'full_size', 'suv', 'truck', 'van'] as const;

const SPOT_TYPE_LABELS: Record<string, string> = {
  driveway: 'Driveway',
  garage: 'Garage',
  lot: 'Lot',
  underground: 'Underground',
  other: 'Other',
};

type Step = 'details' | 'location' | 'photos' | 'availability' | 'review';

const STEPS: { key: Step; label: string }[] = [
  { key: 'details', label: 'Details' },
  { key: 'location', label: 'Location' },
  { key: 'photos', label: 'Photos' },
  { key: 'availability', label: 'Availability' },
  { key: 'review', label: 'Review' },
];

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

  // spotId is set after the spot is created (on leaving the location step)
  const [spotId, setSpotId] = useState<string | null>(null);

  // Photos — list of confirmed S3 keys
  const [photoKeys, setPhotoKeys] = useState<string[]>([]);

  // Availability — rules and blocks added during the wizard
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRule[]>([]);
  const [availabilityBlocks, setAvailabilityBlocks] = useState<AvailabilityBlock[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(patch: Partial<FormData>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  // ── Step navigation helpers ──────────────────────────────────────────────

  function goBack() {
    const prev = STEPS[currentStepIndex - 1];
    if (prev) setStep(prev.key);
  }

  // ── Create the spot (called when leaving Location step) ──────────────────

  async function createSpot(): Promise<string | null> {
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
        return null;
      }

      const spot = await res.json() as { id: string };
      return spot.id;
    } finally {
      setSaving(false);
    }
  }

  async function handleLocationNext() {
    if (!form.address || !form.latitude) return;

    // If we already created the spot (e.g. user went back), skip re-creation
    if (spotId) {
      setStep('photos');
      return;
    }

    const id = await createSpot();
    if (id) {
      setSpotId(id);
      setStep('photos');
    }
  }

  // ── Final submit ─────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!spotId) return;
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/parking-spots/${spotId}/submit-review`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      );
      router.push('/listings');
    } catch {
      setError('Failed to submit listing for review');
    } finally {
      setSaving(false);
    }
  }

  // ── Step indicator ───────────────────────────────────────────────────────

  return (
    <div>
      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-1 overflow-x-auto">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1 shrink-0">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
              step === s.key
                ? 'bg-black text-white'
                : currentStepIndex > i
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-500'
            }`}>
              {currentStepIndex > i ? '✓' : i + 1}
            </div>
            <span className={`text-sm ${step === s.key ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="text-gray-200 mx-1">→</span>}
          </div>
        ))}
      </div>

      {/* ── Step 1: Details ── */}
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
                  <option key={t} value={t}>{SPOT_TYPE_LABELS[t]}</option>
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
            <label className="text-sm font-medium text-gray-700">Rules (one per line, optional)</label>
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
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
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
            disabled={!form.title || !form.pricePerHour || !form.entryInstructions}
          >
            Next: Location →
          </Button>
        </div>
      )}

      {/* ── Step 2: Location ── */}
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

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" onClick={goBack}>← Back</Button>
            <Button
              className="flex-1"
              onClick={handleLocationNext}
              disabled={!form.address || !form.latitude || saving}
            >
              {saving ? 'Saving...' : 'Next: Photos →'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Photos ── */}
      {step === 'photos' && spotId && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Upload photos of your parking spot. At least one photo is recommended.
          </p>
          <PhotoUploader
            spotId={spotId}
            confirmedKeys={photoKeys}
            onKeysChange={setPhotoKeys}
          />
          <div className="flex gap-3">
            <Button variant="outline" onClick={goBack}>← Back</Button>
            <Button className="flex-1" onClick={() => setStep('availability')}>
              Next: Availability →
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Availability ── */}
      {step === 'availability' && spotId && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Set your weekly schedule and block out any dates you're unavailable.
          </p>
          <AvailabilityEditor
            spotId={spotId}
            rules={availabilityRules}
            blocks={availabilityBlocks}
            onRulesChange={setAvailabilityRules}
            onBlocksChange={setAvailabilityBlocks}
          />
          <div className="flex gap-3">
            <Button variant="outline" onClick={goBack}>← Back</Button>
            <Button className="flex-1" onClick={() => setStep('review')}>
              Next: Review →
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 5: Review & Submit ── */}
      {step === 'review' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
            <ReviewRow label="Title" value={form.title} />
            <ReviewRow label="Type" value={SPOT_TYPE_LABELS[form.type] ?? form.type} />
            <ReviewRow label="Price" value={`$${Number(form.pricePerHour).toFixed(2)}/hr`} />
            <ReviewRow label="Address" value={form.address} />
            <ReviewRow label="Covered" value={form.isCovered ? 'Yes' : 'No'} />
            <ReviewRow label="Overnight" value={form.allowOvernight ? 'Yes' : 'No'} />
            {form.maxVehicleSize && (
              <ReviewRow label="Max vehicle" value={form.maxVehicleSize.replace(/_/g, ' ')} />
            )}
            {form.heightRestrictionCm && (
              <ReviewRow label="Height limit" value={`${form.heightRestrictionCm} cm`} />
            )}
            <ReviewRow label="Photos" value={`${photoKeys.length} uploaded`} />
            <ReviewRow label="Availability rules" value={`${availabilityRules.length} rule${availabilityRules.length !== 1 ? 's' : ''}`} />
            <ReviewRow label="Blocked dates" value={`${availabilityBlocks.length} block${availabilityBlocks.length !== 1 ? 's' : ''}`} />
          </div>

          <div className="rounded-xl bg-yellow-50 p-3 text-sm text-yellow-800">
            Your listing will be submitted for admin review before going live.
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" onClick={goBack}>← Back</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Submitting...' : 'Submit for Review'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}
