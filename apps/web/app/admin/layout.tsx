import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin nav */}
      <nav className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold text-gray-900">🦙 Admin</span>
            <Link href="/admin/listings" className="text-sm text-gray-600 hover:text-gray-900">Listings</Link>
            <Link href="/admin/bookings" className="text-sm text-gray-600 hover:text-gray-900">Bookings</Link>
            <Link href="/admin/users" className="text-sm text-gray-600 hover:text-gray-900">Users</Link>
          </div>
          <Link href="/search" className="text-sm text-gray-400 hover:text-gray-600">← Back to app</Link>
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
