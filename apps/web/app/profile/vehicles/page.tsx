import { VehiclesManager } from '@/components/profile/vehicles-manager';

export default function VehiclesPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <a href="/search" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to search
        </a>
      </div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">My Vehicles</h1>
      <VehiclesManager />
    </main>
  );
}
