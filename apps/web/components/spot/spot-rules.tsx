import type { ParkingSpot } from '@alpaca/types';

export function SpotRules({ spot }: { spot: ParkingSpot }) {
  return (
    <div className="space-y-5">
      {spot.entryInstructions && (
        <div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Entry instructions</h2>
          <p className="text-gray-600">{spot.entryInstructions}</p>
        </div>
      )}

      {spot.rules.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">Rules</h2>
          <ul className="space-y-1">
            {spot.rules.map((rule, i) => (
              <li key={i} className="flex items-start gap-2 text-gray-600">
                <span className="mt-0.5 text-gray-400">•</span>
                {rule}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Cancellation policy</h2>
        <p className="text-gray-600">
          Free cancellation if you cancel more than 1 hour before your booking starts.
          No refund for cancellations within 1 hour of start time.
        </p>
      </div>
    </div>
  );
}
