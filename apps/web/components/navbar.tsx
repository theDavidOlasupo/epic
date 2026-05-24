'use client';

import Link from 'next/link';
import { useAuth, useUser, SignInButton, UserButton } from '@clerk/nextjs';

export function Navbar() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  // Read role from Clerk publicMetadata (set by webhook)
  const role = (user?.publicMetadata as { role?: string } | undefined)?.role ?? 'driver';

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* Logo / Home link */}
        <Link href="/" className="flex items-center gap-2 font-bold text-gray-900">
          <span className="text-xl">🦙</span>
          <span className="hidden sm:inline">Alpaca Parking</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-4 text-sm">
          <Link href="/search" className="text-gray-600 hover:text-gray-900">
            Find parking
          </Link>

          {isSignedIn && (
            <>
              <Link href="/bookings" className="text-gray-600 hover:text-gray-900">
                Bookings
              </Link>
              <Link href="/listings" className="text-gray-600 hover:text-gray-900">
                {role === 'driver' ? 'Host a spot' : 'Listings'}
              </Link>
              {role === 'admin' && (
                <Link href="/admin/listings" className="text-gray-600 hover:text-gray-900">
                  Admin
                </Link>
              )}
            </>
          )}

          {/* Auth */}
          {isSignedIn ? (
            <UserButton />
          ) : (
            <SignInButton mode="modal">
              <button className="rounded-full bg-black px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800">
                Sign in
              </button>
            </SignInButton>
          )}
        </div>
      </div>
    </nav>
  );
}
