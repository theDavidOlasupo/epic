import type { ParkingSpot } from '@alpaca/types';

const spotTypeLabel: Record<string, string> = {
  driveway: 'Driveway',
  garage: 'Garage',
  lot: 'Lot',
  underground: 'Underground',
  other: 'Other',
};

interface SpotDetailHeroProps {
  spot: ParkingSpot;
}

export function SpotDetailHero({ spot }: SpotDetailHeroProps) {
  const primaryPhoto = spot.photos[0];

  return (
    <div>
      {/* Photo */}
      <div className="h-64 w-full overflow-hidden rounded-2xl bg-gray-100 sm:h-80">
        {primaryPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primaryPhoto}
            alt={spot.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-6xl">🅿️</div>
        )}
      </div>

      {/* Title + meta */}
      <div className="mt-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">{spot.title}</h1>
          <p className="shrink-0 text-xl font-semibold text-gray-900">
            ${(spot.pricePerHour / 100).toFixed(2)}
            <span className="text-sm font-normal text-gray-500">/hr</span>
          </p>
        </div>
        <p className="mt-1 text-gray-500">{spot.address}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
            {spotTypeLabel[spot.type] ?? spot.type}
          </span>
          {spot.isCovered && (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              Covered
            </span>
          )}
          {spot.allowOvernight && (
            <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700">
              Overnight OK
            </span>
          )}
          {spot.maxVehicleSize && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              Max: {spot.maxVehicleSize.replace('_', ' ')}
            </span>
          )}
          {spot.heightRestrictionCm && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              Max height: {spot.heightRestrictionCm}cm
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
