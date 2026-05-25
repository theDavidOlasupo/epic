'use client';

import { useState, useCallback } from 'react';
import { WhereInput } from './where-input';
import { WhenPicker } from './when-picker';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

export interface SearchParams {
  address: string;
  lat: number;
  lng: number;
  startTime: string;
  endTime: string;
}

interface SearchBarProps {
  initialParams?: Partial<SearchParams>;
  onSearch: (params: SearchParams) => void;
  compact?: boolean;
}

export function SearchBar({ initialParams, onSearch, compact = false }: SearchBarProps) {
  const [address, setAddress] = useState(initialParams?.address ?? '');
  const [lat, setLat] = useState(initialParams?.lat ?? 0);
  const [lng, setLng] = useState(initialParams?.lng ?? 0);
  const [startTime, setStartTime] = useState(initialParams?.startTime ?? '');
  const [endTime, setEndTime] = useState(initialParams?.endTime ?? '');

  const handlePlaceChange = useCallback((addr: string, la: number, ln: number) => {
    setAddress(addr);
    setLat(la);
    setLng(ln);
  }, []);

  const handleTimeChange = useCallback((start: string, end: string) => {
    setStartTime(start);
    setEndTime(end);
  }, []);

  function handleSearch() {
    if (!lat || !lng || !startTime || !endTime) return;
    onSearch({ address, lat, lng, startTime, endTime });
  }

  return (
    <div className={`flex flex-col sm:flex-row sm:items-stretch rounded-2xl sm:rounded-full border border-gray-200 bg-white shadow-md ${compact ? 'text-sm' : ''}`}>
      {/* Where */}
      <div className="flex-1 min-w-0 border-b sm:border-b-0 sm:border-r border-gray-200">
        <WhereInput value={address} onChange={handlePlaceChange} />
      </div>

      {/* When */}
      <div className="flex-1 min-w-0 border-b sm:border-b-0 sm:border-r border-gray-200">
        <WhenPicker
          startTime={startTime}
          endTime={endTime}
          onChange={handleTimeChange}
        />
      </div>

      {/* Search button */}
      <div className="flex items-center p-2 sm:pr-2 sm:pl-1">
        <Button
          onClick={handleSearch}
          disabled={!lat || !startTime || !endTime}
          className="w-full sm:w-auto rounded-full"
          size={compact ? 'sm' : 'default'}
        >
          <Search className="h-4 w-4" />
          <span className="ml-1">Search</span>
        </Button>
      </div>
    </div>
  );
}
