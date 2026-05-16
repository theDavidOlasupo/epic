import Link from 'next/link';
import type { ParkingSearchResult } from '@alpaca/types';

interface SpotCardProps {
  spot: ParkingSearchResult;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  startTime?: string;
  endTime?: string;
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}/hr`;
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)}m away`;
  return `${(meters / 1000).toFixed(1)}km away`;
}

const spotTypeLabel: Record<string, string> = {
  driveway: 'Driveway',
  garage: 'Garage',
  lot: 'Lot',
  underground: 'Underground',
  other: 'Other',
};

export function SpotCard({ spot, isHovered, onHover, startTime, endTime }: SpotCardProps) {
  const params = new URLSearchParams();
  if (startTime) params.set('startTime', startTime);
  if (endTime) params.set('endTime', endTime);
  const query = params.toString();

  return (
    <Link href={`/parking/${spot.id}${query ? `?${query}` : ''}`}>
      <div
        onMouseEnter={() => onHover(spot.id)}
        onMouseLeave={() => onHover(null)}
        className={`
          flex gap-3 rounded-xl border p-3 cursor-pointer transition-all duration-150
          ${isHovered ? 'border-gray-900 shadow-md' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'}
        `}
      >
      {/* Photo */}
      <div className="h-20 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {spot.primaryPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={spot.primaryPhotoUrl}
            alt={spot.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">🅿️</div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col justify-between min-w-0">
        <div>
          <h3 className="truncate font-semibold text-gray-900">{spot.title}</h3>
          <p className="truncate text-sm text-gray-500">{spot.address}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
            <span>{spotTypeLabel[spot.type] ?? spot.type}</span>
            <span>·</span>
            <span>{formatDistance(spot.distanceMeters)}</span>
            {spot.isCovered && (
              <>
                <span>·</span>
                <span>Covered</span>
              </>
            )}
          </div>
        </div>
        <p className="text-sm font-semibold text-gray-900">{formatPrice(spot.pricePerHour)}</p>
      </div>
      </div>
    </Link>
  );
}
