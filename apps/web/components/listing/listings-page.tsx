'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import Link from 'next/link';
import type { ParkingSpot, ListingStatus } from '@alpaca/types';

const STATUS_STYLES: Record<ListingStatus, string> = {
  draft:          'bg-gray-100 text-gray-600',
  pending_review: 'bg-yellow-100 text-yellow-700',
  active:         'bg-green-100 text-green-700',
  paused:         'bg-orange-100 text-orange-700',
  rejected:       'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<ListingStatus, string> = {
  draft:          'Draft',
  pending_review: 'Pending Review',
  active:         'Active',
  paused:         'Paused',
  rejected:       'Rejected',
};

export function ListingsPage() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const [isHost, setIsHost] = useState(true); // assume host until proven otherwise

  const fetchSpots = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/parking-spots/mine`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 403) {
        // User is a driver, not a host yet
        setIsHost(false);
        return;
      }
      if (!res.ok) {
        const err = await res.json() as { error: { message: string } };
        setError(err.error?.message ?? 'Failed to load listings');
        return;
      }
      setSpots(await res.json() as ParkingSpot[]);
      setIsHost(true);
    } catch {
      setError('Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { void fetchSpots(); }, [fetchSpots]);

  async function handleBecomeHost() {
    setUpgrading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me/become-host`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        setIsHost(true);
        void fetchSpots();
      }
    } finally {
      setUpgrading(false);
    }
  }

  if (loading) return <p className="text-gray-400">Loading listings...</p>;

  // Show "Become a host" prompt for drivers
  if (!isHost) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
        <span className="text-4xl">🏠</span>
        <p className="mt-4 text-lg font-medium text-gray-900">Earn money with your parking spot</p>
        <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
          List your driveway, garage, or parking space and earn money when drivers book it.
        </p>
        <button
          onClick={handleBecomeHost}
          disabled={upgrading}
          className="mt-6 inline-block rounded-full bg-black px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {upgrading ? 'Setting up...' : 'Become a host'}
        </button>
      </div>
    );
  }

  if (error) return <p className="text-red-500">{error}</p>;

  if (spots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
        <p className="text-lg font-medium text-gray-700">No listings yet</p>
        <p className="mt-1 text-sm text-gray-400">Create your first parking spot to start earning.</p>
        <Link
          href="/listings/new"
          className="mt-4 inline-block rounded-full bg-black px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Create a listing
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {spots.map((spot) => (
        <div key={spot.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900">{spot.title}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[spot.status]}`}>
                {STATUS_LABELS[spot.status]}
              </span>
            </div>
            <p className="text-sm text-gray-500">{spot.address}</p>
            <p className="text-sm text-gray-500">
              ${(spot.pricePerHour / 100).toFixed(2)}/hr · {spot.type}
            </p>
          </div>
          <div className="flex gap-2">
            {(spot.status === 'draft' || spot.status === 'rejected') && (
              <Link
                href={`/listings/${spot.id}/edit`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Edit
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
