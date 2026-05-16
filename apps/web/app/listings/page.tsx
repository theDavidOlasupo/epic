import { ListingsPage } from '@/components/listing/listings-page';

export default function HostListingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Listings</h1>
        <a
          href="/listings/new"
          className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + New Listing
        </a>
      </div>
      <ListingsPage />
    </main>
  );
}
