'use client';

import { SignUp, useAuth } from '@clerk/nextjs';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, Suspense } from 'react';

function ClaimGuestAccount() {
  const { isSignedIn, getToken } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const guestToken = searchParams.get('guestToken');

  useEffect(() => {
    if (!isSignedIn || !guestToken) return;

    // Claim the guest booking after sign-up
    getToken().then(async (token) => {
      if (!token) return;
      try {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/claim-guest-account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ guestToken }),
        });
      } catch {
        // Non-fatal — user is signed up, booking just won't be linked
        console.error('Failed to claim guest account');
      }
      router.push('/bookings');
    });
  }, [isSignedIn, guestToken, getToken, router]);

  return null;
}

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <Suspense>
        <ClaimGuestAccount />
      </Suspense>
      <SignUp />
    </main>
  );
}
