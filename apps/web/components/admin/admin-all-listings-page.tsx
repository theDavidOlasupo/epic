'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
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

const STATUSES: (ListingStatus | 'all')[] = ['all', 'active', 'pending_review', 'paused', 'draft', 'rejected'];

export function AdminAllListingsPage() {
  const { getToken } = useAuth();
  const [listings, setListings] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ListingStatus | 'all'>('all');

  const fetchListings = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/listings`);
    if (filter !== 'all') url.searchParams.set('status', filter);
    url.searchParams.set('limit', '100');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json() as { listings: ParkingSpot[] };
      setListings(data.listings);
    }
    setLoading(false);
  }, [getToken, filter]);

  useEffect(() => { void fetchListings(); }, [fetchListings]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-gray-900">All Listings</h1>

      {/* Status filter tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filter === s
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'All' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-400">Loading...</p>}

      {!loading && listings.length === 0 && (
        <p className="text-gray-400">No listings found.</p>
      )}

      {!loading && listings.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">{listings.length} listing{listings.length !== 1 ? 's' : ''}</p>
          {listings.map((listing) => (
            <div key={listing.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-gray-900">{listing.title}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[listing.status]}`}>
                  {STATUS_LABELS[listing.status]}
                </span>
              </div>
              <p className="text-sm text-gray-500">{listing.address}</p>
              <p className="text-sm text-gray-500">
                {listing.type} · ${(listing.pricePerHour / 100).toFixed(2)}/hr
                {listing.isCovered ? ' · Covered' : ''}
              </p>
              {listing.rejectionReason && (
                <p className="mt-1 text-sm text-red-500">
                  Rejected: {listing.rejectionReason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
