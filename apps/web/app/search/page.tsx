'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { SearchBar, type SearchParams } from '@/components/search/search-bar';
import { MapView } from '@/components/search/map-view';
import { SpotCard } from '@/components/search/spot-card';
import type { ParkingSearchResult } from '@alpaca/types';

async function searchSpots(params: SearchParams): Promise<ParkingSearchResult[]> {
  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/parking-spots/search`);
  url.searchParams.set('lat', String(params.lat));
  url.searchParams.set('lng', String(params.lng));
  url.searchParams.set('radiusKm', '5');
  url.searchParams.set('startTime', params.startTime);
  url.searchParams.set('endTime', params.endTime);

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json() as { spots: ParkingSearchResult[] };
  return data.spots;
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useState<SearchParams | null>(null);
  const [spots, setSpots] = useState<ParkingSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredSpotId, setHoveredSpotId] = useState<string | null>(null);

  const handleSearch = useCallback(async (params: SearchParams) => {
    setSearchParams(params);
    setLoading(true);
    try {
      const results = await searchSpots(params);
      setSpots(results);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="flex h-screen flex-col">
      {/* Top search bar */}
      <header className="z-10 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex-1">
            <SearchBar
              initialParams={searchParams ?? undefined}
              onSearch={handleSearch}
              compact
            />
          </div>
          <Link
            href="/bookings"
            className="shrink-0 rounded-full border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            My Bookings
          </Link>
          <UserButton />
        </div>
      </header>

      {/* Pre-search state */}
      {!searchParams && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-gray-50">
          <p className="text-2xl font-semibold text-gray-700">Where are you parking?</p>
          <p className="text-gray-400">Enter a destination and time above to find spots</p>
        </div>
      )}

      {/* Post-search split view */}
      {searchParams && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Map */}
          <div className="h-[45%] w-full">
            <MapView
              center={{ lat: searchParams.lat, lng: searchParams.lng }}
              searchKey={`${searchParams.lat},${searchParams.lng}`}
              spots={spots}
              hoveredSpotId={hoveredSpotId}
              onSpotHover={setHoveredSpotId}
            />
          </div>

          {/* Spot list */}
          <div className="flex-1 overflow-y-auto bg-white">
            {loading && (
              <div className="flex items-center justify-center py-12 text-gray-400">
                Searching...
              </div>
            )}
            {!loading && spots.length === 0 && (
              <div className="flex items-center justify-center py-12 text-gray-400">
                No spots found nearby. Try a different location or time.
              </div>
            )}
            {!loading && spots.length > 0 && (
              <div className="p-4">
                <p className="mb-3 text-sm text-gray-500">{spots.length} spot{spots.length !== 1 ? 's' : ''} found</p>
                <div className="space-y-3">
                  {spots.map((spot) => (
                    <SpotCard
                      key={spot.id}
                      spot={spot}
                      isHovered={hoveredSpotId === spot.id}
                      onHover={setHoveredSpotId}
                      startTime={searchParams.startTime}
                      endTime={searchParams.endTime}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
