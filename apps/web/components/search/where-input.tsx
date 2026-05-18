'use client';

// Force cache invalidation
import { useRef, useEffect } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

interface WhereInputProps {
  value: string;
  onChange: (address: string, lat: number, lng: number) => void;
  placeholder?: string;
}

export function WhereInput({ value, onChange, placeholder = 'Where are you going?' }: WhereInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const places = useMapsLibrary('places');

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const autocomplete = new places.Autocomplete(inputRef.current, {
      types: ['geocode', 'establishment'],
      componentRestrictions: { country: 'ca' }, // Canada only for MVP
      fields: ['geometry', 'formatted_address'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const lat = place.geometry?.location?.lat();
      const lng = place.geometry?.location?.lng();
      const address = place.formatted_address ?? '';
      if (lat !== undefined && lng !== undefined) {
        onChange(address, lat, lng);
      }
    });

    return () => {
      // Cleanup listener
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).google?.maps?.event?.clearInstanceListeners(autocomplete);
    };
  }, [places, onChange]);

  return (
    <div className="flex h-full w-full items-center gap-2 px-4 py-3">
      <span className="text-gray-400">📍</span>
      <input
        ref={inputRef}
        type="text"
        defaultValue={value}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
      />
    </div>
  );
}
