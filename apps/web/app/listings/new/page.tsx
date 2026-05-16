import { ListingWizard } from '@/components/listing/listing-wizard';

export default function NewListingPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <a href="/listings" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to listings
        </a>
      </div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Create a listing</h1>
      <ListingWizard />
    </main>
  );
}
