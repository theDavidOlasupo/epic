# Implementation Tasks — Alpaca Parking MVP

## Task 1: Project Scaffolding and Monorepo Setup

- [ ] 1.1 Initialise a pnpm monorepo with workspaces: `apps/web`, `packages/lambdas`, `packages/types`, `packages/db`
- [ ] 1.2 Configure TypeScript (`tsconfig.base.json`) with strict mode and path aliases shared across packages
- [ ] 1.3 Set up esbuild bundling for Lambda functions (ARM64 target)
- [ ] 1.4 Add ESLint + Prettier config at the root
- [ ] 1.5 Create `packages/types/src/index.ts` with all shared domain types (`User`, `Vehicle`, `ParkingSpot`, `Booking`, `Payment`, `CheckoutLock`, `HostPayoutRecord`, `AvailabilityRule`, `AvailabilityBlock`, `ErrorResponse`, and all request/response shapes)
- [ ] 1.6 Set up AWS SAM or CDK project skeleton for infrastructure-as-code

---

## Task 2: Database Setup

- [ ] 2.1 Provision Amazon RDS PostgreSQL instance with PostGIS extension enabled
- [ ] 2.2 Configure RDS Proxy for Lambda connection pooling
- [ ] 2.3 Create `packages/db` with a migration runner (e.g. `node-pg-migrate` or `kysely` migrations)
- [ ] 2.4 Write migration: enable `postgis` and `btree_gist` extensions
- [ ] 2.5 Write migration: create `users` table with all columns, constraints, and indexes
- [ ] 2.6 Write migration: create `vehicles` table with FK to `users` and indexes
- [ ] 2.7 Write migration: create `parking_spots` table with `GEOGRAPHY(POINT, 4326)` column, spatial index, and status index
- [ ] 2.8 Write migration: create `availability_rules` table with index on `parking_spot_id`
- [ ] 2.9 Write migration: create `availability_blocks` table with composite index on `(parking_spot_id, start_time, end_time)`
- [ ] 2.10 Write migration: create `bookings` table with `EXCLUDE` constraint using `tstzrange` for overlap prevention and all indexes
- [ ] 2.11 Write migration: create `checkout_locks` table with `EXCLUDE` constraint (partial, `WHERE expires_at > NOW()`) and indexes
- [ ] 2.12 Write migration: create `payments` table with unique index on `provider_payment_intent_id`
- [ ] 2.13 Write migration: create `host_payout_records` table with indexes
- [ ] 2.14 Write migration: create `otp_records` table with index on `user_id`
- [ ] 2.15 Set up a local PostgreSQL + PostGIS environment (Docker Compose) for development

---

## Task 3: Authentication and User Management

- [ ] 3.1 Integrate Clerk: configure Clerk application, set up JWT template with custom claims (`userId`, `role`, `status`)
- [ ] 3.2 Implement Clerk webhook handler (`user.created`) — creates a `users` row and writes `internalId`, `role`, `status` back to Clerk `publicMetadata`
- [ ] 3.3 Implement Clerk webhook handler (`user.updated`) — syncs `emailVerified` to the `users` table
- [ ] 3.4 Implement `verifyToken` Lambda middleware using `jose` + Clerk JWKS endpoint (with in-memory JWKS cache)
- [ ] 3.5 Implement `requireRole(role)` middleware — returns 403 if the JWT role does not match
- [ ] 3.6 Implement `checkAccountStatus` middleware — returns 403 `ACCOUNT_SUSPENDED` or `ACCOUNT_BANNED` for non-active users
- [ ] 3.7 Implement `GET /api/v1/users/me` — returns the authenticated user's profile
- [ ] 3.8 Implement `PUT /api/v1/users/me` — updates `name` and `phoneNumber`
- [ ] 3.9 Implement `PUT /api/v1/admin/users/:id/status` — admin changes user status to `active`, `suspended`, or `banned`
- [ ] 3.10 Implement `GET /api/v1/admin/users` — paginated user list with `role` and `status` filters

---

## Task 4: Phone Verification (Host OTP)

- [ ] 4.1 Implement `POST /api/v1/auth/verify-phone` — generate 6-digit OTP, bcrypt-hash it, store in `otp_records` with 10-minute expiry, send SMS via AWS SNS
- [ ] 4.2 Implement `POST /api/v1/auth/confirm-phone` — look up latest unused OTP for user, verify hash, mark `users.phone_verified = true` and OTP as used
- [ ] 4.3 Return 422 `INVALID_OTP` for incorrect or expired OTP submissions

---

## Task 5: Vehicle Profile Management

- [ ] 5.1 Implement `POST /api/v1/users/me/vehicles` — create a vehicle record; enforce required fields (`make`, `model`, `year`, `sizeClass`, `licencePlate`, `licencePlateRegion`)
- [ ] 5.2 Implement `GET /api/v1/users/me/vehicles` — return all vehicles for the authenticated driver
- [ ] 5.3 Implement `DELETE /api/v1/users/me/vehicles/:vehicleId` — delete vehicle; return 422 `VEHICLE_IN_USE` if the vehicle is on an upcoming confirmed booking
- [ ] 5.4 Support `isDefault` flag: when a vehicle is set as default, unset the flag on all other vehicles for that user

---

## Task 6: Host Parking Spot Listing

- [ ] 6.1 Implement `POST /api/v1/parking-spots` — create a listing in `draft` status; validate required fields; insert PostGIS `GEOGRAPHY` point from `latitude`/`longitude`
- [ ] 6.2 Implement `PUT /api/v1/parking-spots/:id` — update listing; enforce ownership; return 422 `LISTING_NOT_EDITABLE` if status is `pending_review` or `active`
- [ ] 6.3 Implement `POST /api/v1/parking-spots/:id/submit-review` — transition status from `draft`/`rejected` to `pending_review`
- [ ] 6.4 Implement `POST /api/v1/parking-spots/:id/pause` — transition status from `active` to `paused` (host-initiated)
- [ ] 6.5 Implement `POST /api/v1/parking-spots/:id/photos/upload-url` — generate S3 pre-signed PUT URL (15-minute expiry); return `{ uploadUrl, key }`
- [ ] 6.6 Implement photo key persistence — after client confirms upload, append the S3 key to `parking_spots.photos`
- [ ] 6.7 Implement `GET /api/v1/parking-spots/:id` — return full spot detail including host name and `phoneVerified`; return 404 for non-active spots on driver requests

---

## Task 7: Availability Rules and Blocked Dates

- [ ] 7.1 Implement `POST /api/v1/parking-spots/:id/availability-rules` — create a recurring weekly rule; validate `dayOfWeek`, `startTime` (HH:MM), `endTime`, and IANA `timezone`
- [ ] 7.2 Implement `DELETE /api/v1/parking-spots/:id/availability-rules/:ruleId` — delete a rule; enforce ownership
- [ ] 7.3 Implement `POST /api/v1/parking-spots/:id/availability-blocks` — create a one-off block; return 422 `BLOCK_CONFLICTS_WITH_BOOKING` if the block overlaps a confirmed booking
- [ ] 7.4 Implement `DELETE /api/v1/parking-spots/:id/availability-blocks/:blockId` — delete a block; enforce ownership
- [ ] 7.5 Implement `AvailabilityService.isAvailable(spotId, startTime, endTime)` — checks that the requested window falls within an `AvailabilityRule` and is not covered by any `AvailabilityBlock`

---

## Task 8: Admin Listing Review

- [ ] 8.1 Implement `GET /api/v1/admin/listings/pending` — paginated list of spots with status `pending_review`; admin role required
- [ ] 8.2 Implement `POST /api/v1/admin/listings/:id/approve` — set status to `active`; enqueue approval email to host
- [ ] 8.3 Implement `POST /api/v1/admin/listings/:id/reject` — set status to `rejected`, store `rejectionReason`; enqueue rejection email to host
- [ ] 8.4 Implement `POST /api/v1/admin/listings/:id/pause` — set status to `paused` (admin-initiated)

---

## Task 9: Parking Spot Search and Discovery

- [ ] 9.1 Implement `GET /api/v1/parking-spots/search` — accept `lat`, `lng`, `radiusKm`, `startTime`, `endTime`, and optional filters (`maxPricePerHour`, `maxDistanceMeters`, `type`)
- [ ] 9.2 Implement the PostGIS search query using `ST_DWithin` for radius filtering and `ST_Distance` for distance calculation (Haversine via geography type)
- [ ] 9.3 Exclude spots with overlapping confirmed bookings from search results
- [ ] 9.4 Exclude spots with overlapping `AvailabilityBlock` records from search results
- [ ] 9.5 Exclude spots with status other than `active` from search results
- [ ] 9.6 Return results sorted by `distance_meters` ascending; cap at 50 results
- [ ] 9.7 Return 422 `RADIUS_TOO_LARGE` when `radiusKm > 50`
- [ ] 9.8 Return 422 `INVALID_TIME_RANGE` when `endTime` is not after `startTime`
- [ ] 9.9 Integrate Google Places API geocoding: `POST /api/v1/geocode` (or handle client-side) — resolve address string to `lat`/`lng`; return 422 `GEOCODING_FAILED` on failure

---

## Task 10: Booking Creation and Conflict Prevention

- [ ] 10.1 Implement `POST /api/v1/bookings` — validate required fields; check driver has a registered vehicle (422 `VEHICLE_REQUIRED`); verify `vehicleId` belongs to the driver
- [ ] 10.2 Check spot is `active` and the time window is within availability rules and not blocked
- [ ] 10.3 Check for overlapping confirmed bookings (409 `BOOKING_CONFLICT`)
- [ ] 10.4 Calculate `totalPrice = ceil(pricePerHour * durationHours)` in cents
- [ ] 10.5 Create booking with status `pending`; return 201 with the `Booking` object
- [ ] 10.6 Implement `GET /api/v1/bookings/:id` — return full booking detail (spot address, entry instructions, host rules, cancellation policy); restrict to owner or admin
- [ ] 10.7 Implement `GET /api/v1/users/me/bookings` — return driver's bookings; support `filter=upcoming|past`
- [ ] 10.8 Implement `GET /api/v1/admin/bookings` — paginated booking list with `status`, `driverId`, `spotId` filters; admin role required

---

## Task 11: Checkout Lock

- [ ] 11.1 Implement `POST /api/v1/bookings/:id/checkout-lock` — create a `CheckoutLock` with `expiresAt = now + 10 minutes`
- [ ] 11.2 Enforce the PostgreSQL `EXCLUDE` constraint on `checkout_locks`; map constraint violation to 409 `SPOT_LOCKED`
- [ ] 11.3 Enforce maximum 3 active locks per driver (422 `TOO_MANY_ACTIVE_LOCKS`)
- [ ] 11.4 On lock creation, enqueue an SQS message with a 600-second delay for lock expiry
- [ ] 11.5 Implement SQS worker (`sqs-worker-fn`): on lock expiry message, delete the expired lock and set the associated pending booking status to `expired`

---

## Task 12: Payment Processing

- [ ] 12.1 Implement `POST /api/v1/payments/create-intent` — create a Stripe `PaymentIntent` with `amount`, `currency`, and `metadata` (`bookingId`, `driverId`, `parkingSpotId`); store a `Payment` record with status `requires_payment`; update `bookings.stripe_payment_intent_id`
- [ ] 12.2 Implement `POST /api/v1/payments/webhook` — verify Stripe webhook signature using `stripe.webhooks.constructEvent`
- [ ] 12.3 Handle `payment_intent.succeeded` webhook: set booking status to `confirmed`, payment status to `succeeded`, create `HostPayoutRecord` (status `pending`, 15% platform fee), enqueue confirmation emails for driver and host
- [ ] 12.4 Handle `payment_intent.payment_failed` webhook: set booking status to `payment_failed`, payment status to `failed`
- [ ] 12.5 Delete the `CheckoutLock` when a booking is confirmed

---

## Task 13: Cancellation and Refunds

- [ ] 13.1 Implement `POST /api/v1/bookings/:id/cancel` — enforce ownership (driver or admin)
- [ ] 13.2 Apply cancellation policy: if `now < startTime - 1 hour`, initiate full Stripe refund and set payment status to `refunded`; otherwise no refund
- [ ] 13.3 Set booking status to `cancelled`, record `cancelledAt` and `cancellationReason`
- [ ] 13.4 Update `HostPayoutRecord` status to `cancelled` if a refund was issued; leave as `pending` otherwise
- [ ] 13.5 Return 422 `BOOKING_NOT_CANCELLABLE` if booking status is `expired`, `payment_failed`, or `cancelled`
- [ ] 13.6 Release the time window on cancellation (no additional action needed — the booking status change removes it from conflict checks)

---

## Task 14: Email Notifications

- [ ] 14.1 Set up Amazon SES: verify sender domain, create email templates for each notification type
- [ ] 14.2 Set up SQS `email-queue` and `email-dlq` (dead-letter queue with at least 3 retry attempts)
- [ ] 14.3 Implement SQS worker email handler: dequeue email jobs and send via SES; on failure, allow SQS retry up to 3 times before routing to DLQ
- [ ] 14.4 Implement booking confirmation email to driver (booking ID, spot address, start/end time, total price, entry instructions, cancellation policy)
- [ ] 14.5 Implement booking notification email to host (booking ID, spot address, start/end time, driver name, vehicle licence plate)
- [ ] 14.6 Implement cancellation email to driver (booking ID, spot address, start/end time, refund status)
- [ ] 14.7 Implement cancellation email to host (booking ID, spot address, start/end time)
- [ ] 14.8 Implement payment receipt email to driver (booking ID, amount charged, currency, Stripe payment reference)
- [ ] 14.9 Implement listing approval email to host
- [ ] 14.10 Implement listing rejection email to host (includes rejection reason)

---

## Task 15: Rate Limiting and Abuse Prevention

- [ ] 15.1 Configure API Gateway Usage Plans: 100 req/min per authenticated user, 20 req/min per IP for unauthenticated endpoints
- [ ] 15.2 Implement per-user sliding window rate limit in Lambda middleware (DynamoDB counter store); return 429 `RATE_LIMIT_EXCEEDED` with `Retry-After` header
- [ ] 15.3 Implement login attempt tracking: max 5 failed attempts per email in a 15-minute window; return 429 `ACCOUNT_TEMPORARILY_LOCKED` on breach
- [ ] 15.4 Enforce max 3 active `CheckoutLocks` per driver (already covered in Task 11.3 — verify integration)

---

## Task 16: Frontend — Next.js App Setup

- [ ] 16.1 Scaffold Next.js 14+ App Router project in `apps/web` with TypeScript
- [ ] 16.2 Install and configure `@clerk/nextjs` — wrap app in `<ClerkProvider>`, set up `middleware.ts` for route protection
- [ ] 16.3 Install `@vis.gl/react-google-maps` and configure Google Maps API key
- [ ] 16.4 Set up Tailwind CSS and a base design system (colours, typography, spacing)
- [ ] 16.5 Create shared layout components: `Navbar`, `Footer`, `ErrorBoundary`, `LoadingSpinner`, `PriceDisplay`
- [ ] 16.6 Configure environment variables for API base URL, Clerk publishable key, Google Maps key, Stripe publishable key

---

## Task 17: Frontend — Authentication Pages

- [ ] 17.1 Build `/sign-in` page using Clerk's `<SignIn>` component
- [ ] 17.2 Build `/sign-up` page using Clerk's `<SignUp>` component with role selection (driver or host)
- [ ] 17.3 Implement post-signup webhook flow: on `user.created`, backend assigns role and syncs to Clerk metadata

---

## Task 18: Frontend — Search Page

- [ ] 18.1 Build `WhereInput` component wrapping Google Places Autocomplete; store resolved `lat`/`lng` and formatted address in state
- [ ] 18.2 Build `WhenPicker` component — date picker + start/end time selectors (30-minute increments)
- [ ] 18.3 Build `SearchBar` component composing `WhereInput` and `WhenPicker` with a Search button
- [ ] 18.4 Build `FilterBar` component — max price, max distance, spot type dropdowns
- [ ] 18.5 Build `SpotCard` component — photo, title, distance, price per hour, type badge
- [ ] 18.6 Build `SpotPin` component — map marker with price label; active/dark style when hovered
- [ ] 18.7 Build `MapView` component using `@vis.gl/react-google-maps`; render `SpotPin` for each result
- [ ] 18.8 Build `SearchResultsPage` — split-view container managing `hoveredSpotId` state; wire pin↔card hover interaction
- [ ] 18.9 Implement search API call on form submit; handle loading and empty states

---

## Task 19: Frontend — Spot Detail Page

- [ ] 19.1 Build `/parking/[id]` as a Next.js RSC page (server-rendered for SEO); fetch spot data server-side
- [ ] 19.2 Build `SpotDetailHero` — photo carousel, title, address, type badge, price per hour
- [ ] 19.3 Build `SpotMap` — small embedded Google Map centred on the spot's coordinates
- [ ] 19.4 Build `SpotRules` — rules list, vehicle restrictions, entry instructions
- [ ] 19.5 Build `HostCard` — host name + phone-verified badge
- [ ] 19.6 Build `BookingWidget` — date/time picker + "Reserve" CTA; sticky right column on desktop, bottom sheet on mobile

---

## Task 20: Frontend — Booking and Checkout Flow

- [ ] 20.1 On "Reserve" click: call `POST /api/v1/bookings`, then `POST /api/v1/bookings/:id/checkout-lock`
- [ ] 20.2 Build `CheckoutModal` — Stripe Elements card input; call `POST /api/v1/payments/create-intent` to get `clientSecret`; call `stripe.confirmCardPayment(clientSecret)`
- [ ] 20.3 On payment success, redirect to `/bookings/:id` confirmation page
- [ ] 20.4 Build `BookingCard` component — upcoming/past booking summary (spot address, dates, status badge)
- [ ] 20.5 Build `/bookings` page — list of driver's bookings with upcoming/past tabs
- [ ] 20.6 Build `BookingDetail` component — full booking detail view with cancellation button
- [ ] 20.7 Implement cancellation flow: confirm dialog → `POST /api/v1/bookings/:id/cancel` → update UI with refund status

---

## Task 21: Frontend — Host Listing Management

- [ ] 21.1 Build `ListingWizard` — multi-step form: Location → Details → Photos → Availability → Review & Submit
- [ ] 21.2 Step 1 (Location): Google Places address input + map pin confirmation
- [ ] 21.3 Step 2 (Details): type, price, covered/overnight, vehicle restrictions
- [ ] 21.4 Step 3 (Photos): `PhotoUploader` — request pre-signed URL, upload directly to S3, confirm key back to backend
- [ ] 21.5 Step 4 (Availability): `AvailabilityEditor` — add/remove weekly rules and blocked date ranges
- [ ] 21.6 Step 5 (Review & Submit): summary view + submit for review button
- [ ] 21.7 Build `/listings` page — host's listings with status badges and edit/pause actions
- [ ] 21.8 Build `ListingStatusBadge` component — colour-coded badge for `draft`, `pending_review`, `active`, `paused`, `rejected`
- [ ] 21.9 Build `/listings/[id]/bookings` page — list of bookings for a host's spot

---

## Task 22: Frontend — Admin Dashboard

- [ ] 22.1 Protect all `/admin/*` routes with Clerk `auth()` + role check (`role === 'admin'`)
- [ ] 22.2 Build `PendingListingCard` and `ApproveRejectPanel` components
- [ ] 22.3 Build `/admin/listings` page — paginated pending listings queue with approve/reject actions
- [ ] 22.4 Build `/admin/bookings` page — filterable bookings table
- [ ] 22.5 Build `/admin/users` page — user search by email; `UserStatusControl` for suspend/ban/reactivate actions

---

## Task 23: Infrastructure and Deployment

- [ ] 23.1 Define Lambda functions in SAM/CDK: `parking-spots-fn`, `bookings-fn`, `payments-fn`, `users-fn`, `admin-fn`, `sqs-worker-fn`
- [ ] 23.2 Configure API Gateway HTTP API with Lambda proxy integrations and CORS
- [ ] 23.3 Configure SQS queues: `lock-expiry-queue`, `email-queue`, `email-dlq` with appropriate visibility timeouts and redrive policies
- [ ] 23.4 Configure S3 bucket for parking spot photos with appropriate bucket policy (private, pre-signed URL access only)
- [ ] 23.5 Configure RDS Proxy and connect Lambda functions via VPC
- [ ] 23.6 Set up environment variable management (AWS SSM Parameter Store or Secrets Manager) for DB credentials, Stripe keys, Clerk keys, SES config
- [ ] 23.7 Set up CI/CD pipeline (GitHub Actions): lint → type-check → test → build → deploy to staging on PR merge
- [ ] 23.8 Deploy Next.js frontend to Vercel or AWS Amplify; configure environment variables

---

## Task 24: OpenAPI Documentation

- [ ] 24.1 Write OpenAPI 3.x specification covering all `/api/v1` and `/api/v1/admin` endpoints
- [ ] 24.2 Document all request bodies, query parameters, response schemas, and error codes
- [ ] 24.3 Publish spec as a static file served from the API or a docs site
