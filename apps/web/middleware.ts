import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Routes that require authentication
// Note: /bookings/new and /bookings/guest/* are intentionally excluded (guest checkout)
const isProtectedRoute = createRouteMatcher([
  '/bookings',                    // booking history list
  '/bookings/:id/confirmation',   // confirmed booking detail (auth users)
  '/bookings/:id/payment',        // payment page (auth users)
  '/listings(.*)',
  '/admin(.*)',
  '/profile(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
