import { CheckoutFlow } from '@/components/booking/checkout-flow';

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ spotId?: string; startTime?: string; endTime?: string }>;
}) {
  const { spotId, startTime, endTime } = await searchParams;

  if (!spotId || !startTime || !endTime) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Invalid booking parameters.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6">
        <a href={`/parking/${spotId}`} className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to spot
        </a>
      </div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Reserve your spot</h1>
      <CheckoutFlow spotId={spotId} startTime={startTime} endTime={endTime} />
    </main>
  );
}
