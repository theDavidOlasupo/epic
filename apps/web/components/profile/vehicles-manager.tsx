'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import type { Vehicle } from '@alpaca/types';

const SIZE_CLASS_LABELS: Record<string, string> = {
  compact: 'Compact',
  mid_size: 'Mid-size',
  full_size: 'Full-size',
  suv: 'SUV',
  truck: 'Truck',
  van: 'Van',
  motorcycle: 'Motorcycle',
};

const SIZE_CLASSES = Object.keys(SIZE_CLASS_LABELS);

const CURRENT_YEAR = new Date().getFullYear();

interface VehicleFormData {
  make: string;
  model: string;
  year: string;
  sizeClass: string;
  licencePlate: string;
  licencePlateRegion: string;
  isDefault: boolean;
}

const EMPTY_FORM: VehicleFormData = {
  make: '',
  model: '',
  year: String(CURRENT_YEAR),
  sizeClass: 'mid_size',
  licencePlate: '',
  licencePlateRegion: 'ON',
  isDefault: false,
};

export function VehiclesManager() {
  const { getToken } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<VehicleFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchVehicles = useCallback(async () => {
    const token = await getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me/vehicles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setVehicles(await res.json() as Vehicle[]);
    }
    setLoading(false);
  }, [getToken]);

  useEffect(() => { void fetchVehicles(); }, [fetchVehicles]);

  async function handleAdd() {
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me/vehicles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          year: Number(form.year),
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error: { message: string } };
        setError(err.error?.message ?? 'Failed to add vehicle');
        return;
      }

      setShowForm(false);
      setForm(EMPTY_FORM);
      await fetchVehicles();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(vehicleId: string) {
    const token = await getToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me/vehicles/${vehicleId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      await fetchVehicles();
    } else {
      const err = await res.json() as { error: { message: string } };
      alert(err.error?.message ?? 'Could not remove vehicle');
    }
  }

  if (loading) {
    return <p className="text-gray-400">Loading vehicles...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Vehicle list */}
      {vehicles.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
          <p className="text-gray-500">No vehicles added yet.</p>
          <p className="mt-1 text-sm text-gray-400">Add a vehicle to start booking parking spots.</p>
        </div>
      )}

      {vehicles.map((v) => (
        <div
          key={v.id}
          className="flex items-center justify-between rounded-xl border border-gray-200 p-4"
        >
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900">
                {v.year} {v.make} {v.model}
              </p>
              {v.isDefault && (
                <span className="rounded-full bg-black px-2 py-0.5 text-xs text-white">Default</span>
              )}
            </div>
            <p className="text-sm text-gray-500">
              {SIZE_CLASS_LABELS[v.sizeClass] ?? v.sizeClass} · {v.licencePlate} ({v.licencePlateRegion})
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(v.id)}
            className="text-red-500 hover:text-red-700"
          >
            Remove
          </Button>
        </div>
      ))}

      {/* Add vehicle form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Add a vehicle</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Make</label>
              <input
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Toyota"
                value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Model</label>
              <input
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="Camry"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Year</label>
              <input
                type="number"
                min="1990"
                max={CURRENT_YEAR + 1}
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Size</label>
              <select
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={form.sizeClass}
                onChange={(e) => setForm({ ...form, sizeClass: e.target.value })}
              >
                {SIZE_CLASSES.map((s) => (
                  <option key={s} value={s}>{SIZE_CLASS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Licence Plate</label>
              <input
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="ABC 123"
                value={form.licencePlate}
                onChange={(e) => setForm({ ...form, licencePlate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Province/State</label>
              <input
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="ON"
                value={form.licencePlateRegion}
                onChange={(e) => setForm({ ...form, licencePlateRegion: e.target.value })}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            Set as default vehicle
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={saving || !form.make || !form.model || !form.licencePlate}>
              {saving ? 'Saving...' : 'Add Vehicle'}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setError(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!showForm && (
        <Button onClick={() => setShowForm(true)}>+ Add Vehicle</Button>
      )}
    </div>
  );
}
