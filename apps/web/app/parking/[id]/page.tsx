import { notFound } from 'next/navigation';
import type { ParkingSpot } from '@alpaca/types';
import { SpotDetailHero } from '@/components/spot/spot-detail-hero';
import { SpotMap } from '@/components/spot/spot-map';
import { SpotRules } from '@/components/spot/spot-rules';
import { HostCard } from '@/components/spot/host-card';
import { BookingWidget } from '@/components/spot/booking-widget';

interface SpotDetailResponse extends ParkingSpot {
  hostName: string;
  hostPhoneVerified: boolean;
}

async function getSpot(id: string): Promise<SpotDetailResponse | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/parking-spots/${id}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    return res.json() as Promise<SpotDetailResponse>;
  } catch {
    return null;
  }
}

export default async function SpotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ startTime?: string; endTime?: string }>;
}) {
  const { id } = await params;
  const { startTime, endTime } = await searchParams;
  const spot = await getSpot(id);
  if (!spot) notFound();

  return (
    <div className="min-h-screen bg-white">
      {/* Back link */}
      <div className="mx-auto max-w-4xl px-4 pt-4">
        <a href="/search" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to search
        </a>
      </div>

      <div className="mx-auto max-w-4xl px-4 pb-24 pt-4 lg:grid lg:grid-cols-[1fr_360px] lg:gap-10">
        {/* Left column */}
        <div className="space-y-6">
          <SpotDetailHero spot={spot} />
          <SpotMap lat={spot.latitude} lng={spot.longitude} title={spot.title} />
          <SpotRules spot={spot} />
          <HostCard
            name={spot.hostName}
            phoneVerified={spot.hostPhoneVerified}
          />
        </div>

        {/* Right column — sticky booking widget (desktop) */}
        <div className="hidden lg:block">
          <div className="sticky top-6">
            <BookingWidget
              spotId={spot.id}
              pricePerHour={spot.pricePerHour}
              initialStartTime={startTime}
              initialEndTime={endTime}
            />
          </div>
        </div>
      </div>

      {/* Bottom sheet booking widget (mobile) */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white p-4 lg:hidden">
        <BookingWidget
          spotId={spot.id}
          pricePerHour={spot.pricePerHour}
          initialStartTime={startTime}
          initialEndTime={endTime}
          compact
        />
      </div>
    </div>
  );
}
