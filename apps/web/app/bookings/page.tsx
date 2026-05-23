import { UserBookingsPage } from '@/components/booking/user-bookings-page';

export default function BookingsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Bookings</h1>
        <div className="flex items-center gap-3">
          <a href="/listings" className="text-sm text-gray-500 hover:text-gray-900">
            Host a spot →
          </a>
          <a href="/search" className="text-sm text-gray-500 hover:text-gray-900">
            ← Find parking
          </a>
        </div>
      </div>
      <UserBookingsPage />
    </main>
  );
}
