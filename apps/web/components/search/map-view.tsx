'use client';

import { Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import type { ParkingSearchResult } from '@alpaca/types';

interface MapViewProps {
  center: { lat: number; lng: number };
  searchKey: string;
  spots: ParkingSearchResult[];
  hoveredSpotId: string | null;
  onSpotHover: (id: string | null) => void;
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(0)}/hr`;
}

export function MapView({ center, searchKey, spots, hoveredSpotId, onSpotHover }: MapViewProps) {
  return (
    <Map
      key={searchKey}
      defaultCenter={center}
      defaultZoom={14}
      mapId="alpaca-search-map"
      gestureHandling="greedy"
      disableDefaultUI={false}
      className="h-full w-full"
    >
      {spots.map((spot) => {
        const isActive = hoveredSpotId === spot.id;
        return (
          <AdvancedMarker
            key={spot.id}
            position={{ lat: spot.latitude, lng: spot.longitude }}
            onMouseEnter={() => onSpotHover(spot.id)}
            onMouseLeave={() => onSpotHover(null)}
          >
            <div
              className={`
                rounded-full px-2 py-1 text-xs font-semibold shadow-md cursor-pointer
                transition-all duration-150
                ${isActive
                  ? 'bg-gray-900 text-white scale-110'
                  : 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-900 hover:text-white'
                }
              `}
            >
              {formatPrice(spot.pricePerHour)}
            </div>
          </AdvancedMarker>
        );
      })}
    </Map>
  );
}
