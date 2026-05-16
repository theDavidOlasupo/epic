'use client';

import { Map, Marker } from '@vis.gl/react-google-maps';

interface SpotMapProps {
  lat: number;
  lng: number;
  title: string;
}

export function SpotMap({ lat, lng, title }: SpotMapProps) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Location</h2>
      <div className="h-48 w-full overflow-hidden rounded-xl border border-gray-200">
        <Map
          defaultCenter={{ lat, lng }}
          defaultZoom={15}
          gestureHandling="none"
          disableDefaultUI
          className="h-full w-full"
        >
          <Marker position={{ lat, lng }} title={title} />
        </Map>
      </div>
      <p className="mt-2 text-sm text-gray-500">
        Exact address provided after booking
      </p>
    </div>
  );
}
