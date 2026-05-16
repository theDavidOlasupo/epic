'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import type { User, UserStatus } from '@alpaca/types';

const STATUS_STYLES: Record<UserStatus, string> = {
  active:    'bg-green-100 text-green-700',
  suspended: 'bg-yellow-100 text-yellow-700',
  banned:    'bg-red-100 text-red-700',
};

export function AdminUsersPage() {
  const { getToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    const token = await getToken();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/users?limit=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.ok) {
      const data = await res.json() as { users: User[] };
      setUsers(data.users);
    }
    setLoading(false);
  }, [getToken]);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);

  async function updateStatus(userId: string, status: UserStatus) {
    setActionId(userId);
    const token = await getToken();
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/admin/users/${userId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    setActionId(null);
    await fetchUsers();
  }

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-gray-900">Users</h1>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Name</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Email</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Role</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[u.status]}`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {u.status !== 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(u.id, 'active')}
                        disabled={actionId === u.id}
                      >
                        Activate
                      </Button>
                    )}
                    {u.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus(u.id, 'suspended')}
                        disabled={actionId === u.id}
                      >
                        Suspend
                      </Button>
                    )}
                    {u.status !== 'banned' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => updateStatus(u.id, 'banned')}
                        disabled={actionId === u.id}
                      >
                        Ban
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
