'use client';

import Link from 'next/link';
import { SignInButton, SignUpButton, SignOutButton, UserButton, useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';

export function AuthButtons() {
  const { isSignedIn } = useAuth();

  if (isSignedIn) {
    return (
      <div className="mt-8 flex gap-3 justify-center items-center">
        <Button asChild>
          <Link href="/search">Find Parking</Link>
        </Button>
        <UserButton />
      </div>
    );
  }

  return (
    <div className="mt-8 flex gap-3 justify-center items-center">
      <SignInButton mode="redirect">
        <Button>Sign In</Button>
      </SignInButton>
      <SignUpButton mode="redirect">
        <Button variant="outline">Create Account</Button>
      </SignUpButton>
    </div>
  );
}
