'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import type { ParkingSpot } from '@alpaca/types';

export function AdminListingsPage() {
  const { getToken } = useAuth();
  const [listings, setListings] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    const token = await getToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/listings/pending`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      const data = await res.json() as { listings: ParkingSpot[] };
      setListings(data.listings);
    }
    setLoading(false);
  }, [getToken]);

  useEffect(() => { void fetchListings(); }, [fetchListings]);

  async function handleApprove(id: string) {
    setActionId(id);
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/listings/${id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setActionId(null);
    await fetchListings();
  }

  async function handleReject(id: string) {
    if (!rejectReason.trim()) return;
    setActionId(id);
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/listings/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: rejectReason }),
    });
    setActionId(null);
    setRejectingId(null);
    setRejectReason('');
    await fetchListings();
  }

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-gray-900">
        Pending Listings
        {listings.length > 0 && (
          <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-sm font-medium text-yellow-700">
            {listings.length}
          </span>
        )}
      </h1>

      {listings.length === 0 && (
        <p className="text-gray-400">No listings pending review.</p>
      )}

      <div className="space-y-4">
        {listings.map((listing) => (
          <div key={listing.id} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900">{listing.title}</p>
                <p className="text-sm text-gray-500">{listing.address}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {listing.type} · ${(listing.pricePerHour / 100).toFixed(2)}/hr
                  {listing.isCovered ? ' · Covered' : ''}
                  {listing.allowOvernight ? ' · Overnight OK' : ''}
                </p>
                {listing.entryInstructions && (
                  <p className="mt-2 text-sm text-gray-600">
                    <span className="font-medium">Entry:</span> {listing.entryInstructions}
                  </p>
                )}
                {listing.rules.length > 0 && (
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-medium">Rules:</span> {listing.rules.join(', ')}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  onClick={() => handleApprove(listing.id)}
                  disabled={actionId === listing.id}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRejectingId(listing.id)}
                  disabled={actionId === listing.id}
                >
                  Reject
                </Button>
              </div>
            </div>

            {/* Reject reason input */}
            {rejectingId === listing.id && (
              <div className="mt-4 space-y-2">
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                  placeholder="Reason for rejection..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleReject(listing.id)}
                    disabled={!rejectReason.trim() || actionId === listing.id}
                  >
                    Confirm Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setRejectingId(null); setRejectReason(''); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
