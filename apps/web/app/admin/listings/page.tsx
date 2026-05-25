'use client';

import { useState } from 'react';
import { AdminListingsPage } from '@/components/admin/admin-listings-page';
import { AdminAllListingsPage } from '@/components/admin/admin-all-listings-page';

export default function AdminListings() {
  const [tab, setTab] = useState<'pending' | 'all'>('pending');

  return (
    <div>
      {/* Tab switcher */}
      <div className="mb-6 flex gap-2 border-b border-gray-200 pb-3">
        <button
          onClick={() => setTab('pending')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'pending' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Pending Review
        </button>
        <button
          onClick={() => setTab('all')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'all' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          All Listings
        </button>
      </div>

      {tab === 'pending' && <AdminListingsPage />}
      {tab === 'all' && <AdminAllListingsPage />}
    </div>
  );
}
