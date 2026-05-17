# Requirements Document

## Introduction

Alpaca Parking is a parking marketplace that connects drivers looking for short-term parking with hosts who have unused parking spaces. The MVP validates the core marketplace loop — drivers search, book, and pay; hosts list spots and earn money — in one launch city (Toronto or Vancouver).

The MVP covers:
- Search and discovery of parking spots by destination and time window
- Spot detail pages with trust signals
- Booking with conflict prevention and a checkout lock
- Stripe-based pre-payment and refund handling
- Host listing creation with admin approval
- Recurring availability rules and blocked dates
- Email notifications for key booking events
- Driver vehicle profiles (required before booking)
- Role-based access for drivers, hosts, and admins
- REST API backend on AWS Lambda + API Gateway + PostgreSQL/PostGIS

Venue-Based Parking Hubs (Section 14 of the raw spec) are explicitly **post-MVP** and are not covered by these requirements.

---

## Glossary

- **System**: The Alpaca Parking backend API and its supporting infrastructure.
- **Driver**: A registered user who searches for and books parking spots.
- **Host**: A registered user who lists one or more parking spots for rent.
- **Admin**: A privileged user who reviews listings, manages disputes, and oversees marketplace operations.
- **ParkingSpot**: A physical parking location listed by a Host.
- **Booking**: A confirmed reservation of a ParkingSpot for a specific time window by a Driver.
- **CheckoutLock**: A temporary, time-bounded reservation that prevents other Drivers from booking the same time window while a Driver completes payment.
- **AvailabilityRule**: A recurring weekly schedule that defines when a ParkingSpot is available.
- **AvailabilityBlock**: A one-off override that marks a ParkingSpot as unavailable for a specific time range.
- **Payment**: A Stripe-processed financial transaction associated with a Booking.
- **HostPayoutRecord**: A record of the host's share of a completed Booking, stored for future automated payout processing.
- **Vehicle**: A motor vehicle registered to a Driver's profile, including make, model, size class, and licence plate.
- **CancellationPolicy**: The fixed rule governing refund eligibility when a Booking is cancelled.
- **JWT**: JSON Web Token used for stateless authentication.
- **UserStatus**: The account standing of a user. `active` = normal access; `suspended` = temporary block, reversible by admin; `banned` = permanent block.- **PostGIS**: A PostgreSQL extension that adds geospatial query support.
- **SES**: Amazon Simple Email Service, used for transactional emails.
- **SQS**: Amazon Simple Queue Service, used for background job processing.

---

## Requirements

---

### Requirement 1: User Registration and Authentication

**User Story:** As a new user, I want to create an account and log in, so that I can access the platform as a driver, host, or admin.

#### Acceptance Criteria

1. THE System SHALL support user registration with email address, full name, and password.
2. WHEN a user registers, THE System SHALL send an email verification link to the provided email address.
3. WHEN a user submits a valid email verification link, THE System SHALL mark the user's email as verified.
4. WHEN a user submits valid credentials, THE System SHALL return a signed JWT access token.
5. WHEN a user submits invalid credentials, THE System SHALL return an error response with HTTP status 401 and a machine-readable error code of `INVALID_CREDENTIALS`.
6. THE System SHALL assign each user exactly one role from the set `{ "driver", "host", "admin" }` at registration time.
7. WHEN a user is created, THE System SHALL set the user status to `active` by default.
8. THE System SHALL enforce role-based access control on all protected API endpoints.
9. WHEN an authenticated request is received, THE System SHALL identify the requesting user from the JWT and reject requests with expired or invalid tokens with HTTP status 401 and error code `UNAUTHORIZED`.
10. WHEN an authenticated request is received from a user with status `suspended` or `banned`, THE System SHALL reject the request with HTTP status 403 and error code `ACCOUNT_SUSPENDED` or `ACCOUNT_BANNED` respectively.
11. THE System SHALL allow an Admin to change a user's status to `suspended` or `banned`.
12. WHEN a user's status is changed to `suspended` or `banned`, THE System SHALL prevent that user from creating new bookings, listings, or performing any write operations.
13. THE System SHALL allow an Admin to reactivate a suspended or banned user by changing their status back to `active`.
9. THE System SHALL store user records conforming to the following structure:

```ts
type User = {
  id: string;
  email: string;
  name: string;
  phoneNumber?: string;
  role: "driver" | "host" | "admin";
  status: "active" | "suspended" | "banned";
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
};
```

---

### Requirement 2: Driver Vehicle Profile

**User Story:** As a driver, I want to register my vehicle on my profile, so that hosts can verify my vehicle meets their spot's restrictions before I arrive.

#### Acceptance Criteria

1. THE System SHALL allow a Driver to add one or more vehicles to their profile.
2. WHEN a Driver adds a vehicle, THE System SHALL require the following fields: make, model, year, size class, and licence plate number.
3. THE System SHALL store vehicle records conforming to the following structure:

```ts
type Vehicle = {
  id: string;
  userId: string;
  make: string;
  model: string;
  year: number;
  sizeClass: "compact" | "mid_size" | "full_size" | "suv" | "truck" | "van" | "motorcycle";
  licencePlate: string;
  licencePlateRegion: string; // e.g. "ON", "BC"
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};
```

4. THE System SHALL allow a Driver to designate one vehicle as the default vehicle.
5. WHEN a Driver attempts to create a Booking and has no registered vehicle, THE System SHALL reject the request with HTTP status 422 and error code `VEHICLE_REQUIRED`.
6. WHEN a Driver creates a Booking, THE System SHALL record the selected vehicle ID on the Booking.
7. THE System SHALL allow a Driver to update or remove a vehicle from their profile.
8. IF a Driver attempts to remove a vehicle that is associated with an upcoming confirmed Booking, THEN THE System SHALL reject the removal with HTTP status 422 and error code `VEHICLE_IN_USE`.

---

### Requirement 3: Host Phone Verification

**User Story:** As a host, I want to verify my phone number, so that drivers and admins can trust my listing.

#### Acceptance Criteria

1. WHEN a Host requests phone verification, THE System SHALL send a one-time passcode (OTP) to the provided phone number via SMS.
2. WHEN a Host submits the correct OTP within 10 minutes of issuance, THE System SHALL mark the Host's phone number as verified.
3. IF a Host submits an incorrect or expired OTP, THEN THE System SHALL return an error response with HTTP status 422 and error code `INVALID_OTP`.
4. THE System SHALL display phone verification status on the Host's public listing profile.

---

### Requirement 4: Parking Spot Search and Discovery

**User Story:** As a driver, I want to search for available parking spots near my destination for a specific time window, so that I can find and compare options before booking.

#### Acceptance Criteria

1. WHEN a Driver submits a search request with destination coordinates, radius in kilometres, start time, and end time, THE System SHALL return all active ParkingSpots whose availability overlaps the requested time window and whose location falls within the specified radius.
2. THE System SHALL calculate the distance between each returned ParkingSpot and the destination using straight-line (Haversine) distance.
3. THE System SHALL return search results sorted by distance ascending by default.
4. THE System SHALL support filtering search results by price per hour (maximum), distance (maximum), and spot type.
5. THE System SHALL support the following spot types: `driveway`, `garage`, `lot`, `underground`, `other`.
6. WHEN a search request is received with a radius greater than 50 km, THE System SHALL reject the request with HTTP status 422 and error code `RADIUS_TOO_LARGE`.
7. WHEN a search request is received with an end time that is not after the start time, THE System SHALL reject the request with HTTP status 422 and error code `INVALID_TIME_RANGE`.
8. THE System SHALL exclude ParkingSpots with status other than `active` from all search results.
9. THE System SHALL exclude ParkingSpots that have a confirmed Booking overlapping the requested time window from search results.
10. THE System SHALL exclude ParkingSpots that have an AvailabilityBlock covering any part of the requested time window from search results.
11. THE System SHALL return each search result conforming to the following structure:

```ts
type ParkingSearchResult = {
  id: string;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  type: "driveway" | "garage" | "lot" | "underground" | "other";
  pricePerHour: number;
  distanceMeters: number;
  isCovered: boolean;
  isAvailable: boolean;
  primaryPhotoUrl: string | null; // first uploaded photo, null if no photos yet
};
```

---

### Requirement 5: Parking Spot Detail Page

**User Story:** As a driver, I want to view full details about a parking spot, so that I can decide whether it meets my needs before booking.

#### Acceptance Criteria

1. WHEN a Driver requests a ParkingSpot by ID, THE System SHALL return the full spot detail including title, address, coordinates, type, price per hour, photos, rules, entry instructions, vehicle restrictions, availability window, host information, and cancellation policy.
2. THE System SHALL only return ParkingSpots with status `active` to Driver requests.
3. THE System SHALL include the following vehicle restriction fields in the spot detail response: `maxVehicleSize`, `heightRestrictionCm`, `allowOvernight`, `isCovered`.
4. THE System SHALL include the cancellation policy text in the spot detail response.
5. THE System SHALL include the host's name and phone verification status in the spot detail response.

---

### Requirement 6: Host Parking Spot Listing

**User Story:** As a host, I want to create and manage parking spot listings, so that drivers can find and book my space.

#### Acceptance Criteria

1. THE System SHALL allow a Host to create a ParkingSpot listing with the following required fields: title, address, latitude, longitude, spot type, price per hour, at least one photo, entry instructions, and covered/uncovered status.
2. THE System SHALL allow a Host to optionally specify: parking rules, maximum vehicle size, height restriction in centimetres, and whether overnight parking is allowed.
3. WHEN a Host creates a listing, THE System SHALL set the listing status to `draft`.
4. WHEN a Host submits a listing for review, THE System SHALL set the listing status to `pending_review`.
5. THE System SHALL store ParkingSpot records conforming to the following structure:

```ts
type ParkingSpot = {
  id: string;
  hostId: string;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  type: "driveway" | "garage" | "lot" | "underground" | "other";
  pricePerHour: number;
  photos: string[]; // S3 object keys or URLs
  rules: string[];
  entryInstructions: string;
  maxVehicleSize?: "compact" | "mid_size" | "full_size" | "suv" | "truck" | "van";
  heightRestrictionCm?: number;
  isCovered: boolean;
  allowOvernight: boolean;
  cancellationPolicy: "standard"; // fixed for MVP
  status: "draft" | "pending_review" | "active" | "paused" | "rejected";
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
};
```

6. THE System SHALL allow a Host to edit a listing that is in `draft` or `rejected` status.
7. WHEN a Host attempts to edit a listing in `pending_review` or `active` status, THE System SHALL reject the request with HTTP status 422 and error code `LISTING_NOT_EDITABLE`.
8. THE System SHALL allow a Host to pause an `active` listing, setting its status to `paused`.
9. THE System SHALL allow a Host to view all bookings associated with their listings.
10. THE System SHALL support photo uploads via S3 pre-signed URLs. THE System SHALL generate a pre-signed upload URL upon request and save the resulting S3 object key on the listing after the client confirms the upload.

---

### Requirement 7: Availability Rules and Blocked Dates

**User Story:** As a host, I want to define when my parking spot is available and block specific dates, so that drivers only see accurate availability.

#### Acceptance Criteria

1. THE System SHALL allow a Host to create recurring weekly AvailabilityRules for a ParkingSpot, specifying day of week, start time, end time, and timezone.
2. THE System SHALL allow a Host to create AvailabilityBlocks that mark a ParkingSpot as unavailable for a specific start and end time range.
3. WHEN evaluating availability for a search or booking request, THE System SHALL treat a ParkingSpot as available only if the requested time window falls within an AvailabilityRule and is not covered by any AvailabilityBlock.
4. THE System SHALL store AvailabilityRule records conforming to the following structure:

```ts
type AvailabilityRule = {
  id: string;
  parkingSpotId: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
  startTime: string; // HH:MM in 24-hour format
  endTime: string;   // HH:MM in 24-hour format
  timezone: string;  // IANA timezone, e.g. "America/Toronto"
};
```

5. THE System SHALL store AvailabilityBlock records conforming to the following structure:

```ts
type AvailabilityBlock = {
  id: string;
  parkingSpotId: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  reason?: string;
};
```

6. IF a Host creates an AvailabilityBlock that overlaps an existing confirmed Booking, THEN THE System SHALL reject the block creation with HTTP status 422 and error code `BLOCK_CONFLICTS_WITH_BOOKING`.

---

### Requirement 8: Admin Listing Review

**User Story:** As an admin, I want to review and approve or reject host listings before they go live, so that only trustworthy and accurate listings appear to drivers.

#### Acceptance Criteria

1. THE System SHALL prevent a ParkingSpot from appearing in search results until its status is `active`.
2. THE System SHALL allow an Admin to retrieve all listings with status `pending_review`.
3. WHEN an Admin approves a listing, THE System SHALL set the listing status to `active`.
4. WHEN an Admin rejects a listing, THE System SHALL set the listing status to `rejected` and record the rejection reason provided by the Admin.
5. THE System SHALL allow an Admin to pause an `active` listing, setting its status to `paused`.
6. WHEN a listing is approved, THE System SHALL send an approval notification email to the Host via SES.
7. WHEN a listing is rejected, THE System SHALL send a rejection notification email to the Host that includes the rejection reason via SES.
8. THE System SHALL restrict all admin listing management endpoints to users with the `admin` role.

---

### Requirement 9: Checkout Lock

**User Story:** As a driver, I want the parking spot I'm about to pay for to be held for me during checkout, so that I don't lose it to another driver while I'm entering payment details.

#### Acceptance Criteria

1. WHEN a Driver initiates checkout for a ParkingSpot and time window, THE System SHALL create a CheckoutLock that reserves that time window for 10 minutes.
2. WHILE a CheckoutLock is active for a given ParkingSpot and time window, THE System SHALL reject any other Driver's attempt to create a Booking or CheckoutLock for an overlapping time window with HTTP status 409 and error code `SPOT_LOCKED`.
3. WHEN a CheckoutLock expires without a completed payment, THE System SHALL release the lock and make the time window available again.
4. WHEN a Booking is confirmed for the locked time window, THE System SHALL delete the associated CheckoutLock.
5. THE System SHALL store CheckoutLock records conforming to the following structure:

```ts
type CheckoutLock = {
  id: string;
  parkingSpotId: string;
  driverId: string;
  startTime: string;   // ISO 8601
  endTime: string;     // ISO 8601
  expiresAt: string;   // ISO 8601, exactly 10 minutes after creation
  createdAt: string;
};
```

6. THE System SHALL use an SQS-triggered background job or EventBridge scheduled rule to expire stale CheckoutLocks and set the associated pending Booking status to `expired`.

---

### Requirement 10: Booking Creation and Conflict Prevention

**User Story:** As a driver, I want to reserve a parking spot for a specific time window, so that I have a guaranteed place to park.

#### Acceptance Criteria

1. WHEN a Driver creates a Booking, THE System SHALL require: parking spot ID, start time, end time, and vehicle ID.
2. WHEN a Driver creates a Booking, THE System SHALL verify that no confirmed Booking exists for the same ParkingSpot with an overlapping time window.
3. IF an overlapping confirmed Booking exists, THEN THE System SHALL reject the new Booking with HTTP status 409 and error code `BOOKING_CONFLICT`.
4. WHEN a Driver creates a Booking, THE System SHALL set the initial Booking status to `pending`.
5. THE System SHALL store Booking records conforming to the following structure:

```ts
type Booking = {
  id: string;
  driverId: string;
  parkingSpotId: string;
  vehicleId: string;
  startTime: string;   // ISO 8601
  endTime: string;     // ISO 8601
  totalPrice: number;  // in minor currency units (e.g. cents)
  currency: string;    // ISO 4217, e.g. "CAD"
  status: "pending" | "confirmed" | "cancelled" | "expired" | "payment_failed";
  stripePaymentIntentId?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
};
```

6. THE System SHALL calculate `totalPrice` as `pricePerHour × duration in hours`, rounded to the nearest cent.
7. WHEN a Driver requests a Booking, THE System SHALL verify the Driver has at least one registered vehicle and that the selected vehicle ID belongs to the Driver.
8. THE System SHALL allow a Driver to view all of their Bookings, filtered by upcoming or past.
9. THE System SHALL allow a Driver to view the full detail of a single Booking including spot address, entry instructions, host rules, and cancellation policy.

---

### Requirement 11: Payment Processing

**User Story:** As a driver, I want to pay for my booking securely before it is confirmed, so that my spot is guaranteed.

#### Acceptance Criteria

1. WHEN a Driver initiates payment for a pending Booking, THE System SHALL create a Stripe PaymentIntent for the Booking's `totalPrice` and `currency`.
2. WHEN Stripe confirms a payment as succeeded, THE System SHALL set the Booking status to `confirmed` and record the `stripePaymentIntentId` on the Booking.
3. WHEN Stripe reports a payment as failed, THE System SHALL set the Booking status to `payment_failed`.
4. THE System SHALL store Payment records conforming to the following structure:

```ts
type Payment = {
  id: string;
  bookingId: string;
  driverId: string;
  amount: number;       // in minor currency units (e.g. cents)
  currency: string;     // ISO 4217
  provider: "stripe";
  providerPaymentIntentId: string;
  status: "requires_payment" | "processing" | "succeeded" | "failed" | "refunded";
  createdAt: string;
  updatedAt: string;
};
```

5. THE System SHALL store a HostPayoutRecord for every confirmed Booking to support future automated payout processing, conforming to the following structure:

```ts
type HostPayoutRecord = {
  id: string;
  bookingId: string;
  hostId: string;
  grossAmount: number;       // total paid by driver, in minor currency units
  platformFeeAmount: number; // platform commission, in minor currency units
  hostEarnings: number;      // grossAmount - platformFeeAmount
  currency: string;          // ISO 4217
  status: "pending" | "paid" | "cancelled";
  paidAt?: string;           // ISO 8601, set when payout is processed
  createdAt: string;
  updatedAt: string;
};
```

6. WHEN a HostPayoutRecord is created, THE System SHALL set its status to `pending`.
7. THE System SHALL support Stripe webhook events for `payment_intent.succeeded` and `payment_intent.payment_failed` to update Booking and Payment status asynchronously.
8. WHEN a Stripe webhook event is received, THE System SHALL verify the Stripe webhook signature before processing the event.

---

### Requirement 12: Cancellation Policy and Refunds

**User Story:** As a driver, I want to cancel a booking and receive a refund if I cancel early enough, so that I'm not penalised for plans that change.

#### Acceptance Criteria

1. THE System SHALL enforce the following fixed cancellation policy for all MVP Bookings:
   - Free cancellation: Driver cancels more than 1 hour before the Booking start time → full refund issued.
   - No refund: Driver cancels 1 hour or less before the Booking start time → no refund issued.
2. WHEN a Driver cancels a Booking more than 1 hour before the start time, THE System SHALL initiate a full refund via the Stripe Refunds API and set the Payment status to `refunded`.
3. WHEN a Driver cancels a Booking 1 hour or less before the start time, THE System SHALL set the Booking status to `cancelled` without initiating a refund.
4. WHEN a Booking is cancelled, THE System SHALL set the Booking status to `cancelled`, record the `cancelledAt` timestamp, and record the `cancellationReason` if provided.
5. WHEN a Booking is cancelled, THE System SHALL update the associated HostPayoutRecord status to `cancelled` if a refund was issued, or leave it as `pending` if no refund was issued.
6. THE System SHALL not allow cancellation of a Booking with status `expired`, `payment_failed`, or `cancelled`.
7. IF a Driver attempts to cancel a Booking with a non-cancellable status, THEN THE System SHALL return HTTP status 422 and error code `BOOKING_NOT_CANCELLABLE`.
8. WHEN a Booking is cancelled, THE System SHALL release the time window so it becomes available for new Bookings.

---

### Requirement 13: Email Notifications

**User Story:** As a driver or host, I want to receive email notifications for important booking events, so that I'm always informed about my reservations.

#### Acceptance Criteria

1. WHEN a Booking status changes to `confirmed`, THE System SHALL send a booking confirmation email to the Driver that includes: booking ID, spot address, start time, end time, total price, entry instructions, and cancellation policy.
2. WHEN a Booking status changes to `confirmed`, THE System SHALL send a booking notification email to the Host that includes: booking ID, spot address, start time, end time, driver name, and vehicle licence plate.
3. WHEN a Booking is cancelled, THE System SHALL send a cancellation notification email to the Driver that includes: booking ID, spot address, start time, end time, and refund status.
4. WHEN a Booking is cancelled, THE System SHALL send a cancellation notification email to the Host that includes: booking ID, spot address, start time, and end time.
5. WHEN a Payment status changes to `succeeded`, THE System SHALL send a payment receipt email to the Driver that includes: booking ID, amount charged, currency, and Stripe payment reference.
6. WHEN a listing status changes to `active`, THE System SHALL send a listing approval email to the Host.
7. WHEN a listing status changes to `rejected`, THE System SHALL send a listing rejection email to the Host that includes the rejection reason.
8. THE System SHALL send all transactional emails via Amazon SES.
9. IF an email send attempt fails, THEN THE System SHALL retry the send via an SQS dead-letter queue with at least 3 retry attempts before logging the failure.

---

### Requirement 14: REST API Design and Error Responses

**User Story:** As a frontend or mobile developer, I want a consistent, versioned REST API with predictable error responses, so that I can build reliable clients.

#### Acceptance Criteria

1. THE System SHALL expose all public API endpoints under the path prefix `/api/v1`.
2. THE System SHALL expose all admin API endpoints under the path prefix `/api/v1/admin`.
3. THE System SHALL use the following HTTP methods consistently: `GET` for reads, `POST` for creates, `PUT` or `PATCH` for updates, `DELETE` for deletions.
4. THE System SHALL return all error responses in the following structure:

```ts
type ErrorResponse = {
  error: {
    code: string;    // machine-readable, e.g. "BOOKING_CONFLICT"
    message: string; // human-readable description
    details?: Record<string, unknown>; // optional field-level validation errors
  };
};
```

5. THE System SHALL use the following HTTP status codes consistently:
   - `200 OK` for successful reads and updates
   - `201 Created` for successful resource creation
   - `400 Bad Request` for malformed request syntax
   - `401 Unauthorized` for missing or invalid authentication
   - `403 Forbidden` for authenticated but unauthorised access
   - `404 Not Found` for missing resources
   - `409 Conflict` for booking conflicts or lock collisions
   - `422 Unprocessable Entity` for business rule violations
   - `429 Too Many Requests` for rate limit violations
   - `500 Internal Server Error` for unexpected server errors
6. THE System SHALL include the following core REST endpoints:

```
GET    /api/v1/parking-spots/search
GET    /api/v1/parking-spots/:id
POST   /api/v1/parking-spots
PUT    /api/v1/parking-spots/:id
POST   /api/v1/parking-spots/:id/submit-review
POST   /api/v1/parking-spots/:id/pause
POST   /api/v1/parking-spots/:id/availability-rules
POST   /api/v1/parking-spots/:id/availability-blocks
POST   /api/v1/parking-spots/:id/photos/upload-url

POST   /api/v1/bookings
GET    /api/v1/bookings/:id
POST   /api/v1/bookings/:id/checkout-lock
POST   /api/v1/bookings/:id/cancel
GET    /api/v1/users/me/bookings

POST   /api/v1/payments/create-intent
POST   /api/v1/payments/webhook

GET    /api/v1/users/me
PUT    /api/v1/users/me
POST   /api/v1/users/me/vehicles
GET    /api/v1/users/me/vehicles
DELETE /api/v1/users/me/vehicles/:vehicleId

GET    /api/v1/admin/listings/pending
POST   /api/v1/admin/listings/:id/approve
POST   /api/v1/admin/listings/:id/reject
POST   /api/v1/admin/listings/:id/pause
GET    /api/v1/admin/bookings
GET    /api/v1/admin/users
```

7. THE System SHALL document all endpoints using an OpenAPI 3.x specification.

---

### Requirement 15: Rate Limiting and Abuse Prevention

**User Story:** As a platform operator, I want the API to enforce rate limits, so that abusive clients cannot degrade service for legitimate users.

#### Acceptance Criteria

1. THE System SHALL enforce a rate limit of 100 requests per minute per authenticated user on all API endpoints.
2. THE System SHALL enforce a rate limit of 20 requests per minute per IP address on unauthenticated endpoints (e.g., search, spot detail).
3. WHEN a client exceeds the rate limit, THE System SHALL return HTTP status 429 and error code `RATE_LIMIT_EXCEEDED` with a `Retry-After` header indicating when the client may retry.
4. THE System SHALL enforce a maximum of 5 failed login attempts per email address within a 15-minute window.
5. IF a user exceeds 5 failed login attempts within 15 minutes, THEN THE System SHALL lock the account for 15 minutes and return HTTP status 429 and error code `ACCOUNT_TEMPORARILY_LOCKED`.
6. THE System SHALL enforce a maximum of 3 active CheckoutLocks per Driver at any given time to prevent lock hoarding.
7. IF a Driver attempts to create a 4th concurrent CheckoutLock, THEN THE System SHALL reject the request with HTTP status 422 and error code `TOO_MANY_ACTIVE_LOCKS`.

---

### Requirement 16: Maps, Geocoding, and Location Services

**User Story:** As a driver, I want to search by destination address and see spots on a map, so that I can understand the location and walking distance.

#### Acceptance Criteria

1. THE System SHALL support address autocomplete for destination input using an external geocoding provider (Google Places API or equivalent).
2. WHEN a Driver submits a destination address string, THE System SHALL geocode the address to latitude and longitude coordinates before executing a search.
3. IF geocoding fails for a submitted address, THEN THE System SHALL return HTTP status 422 and error code `GEOCODING_FAILED`.
4. THE System SHALL calculate straight-line distance between a destination and each ParkingSpot using the Haversine formula.
5. THE System SHALL use PostGIS spatial indexing to efficiently query ParkingSpots within a given radius.
6. THE System SHALL store all coordinates using the WGS 84 coordinate reference system (EPSG:4326).

---

### Requirement 17: Infrastructure and Deployment

**User Story:** As a developer, I want the backend deployed on a cost-efficient, scalable AWS infrastructure, so that the MVP can launch with low operational overhead.

#### Acceptance Criteria

1. THE System SHALL deploy API handlers as AWS Lambda functions using Node.js and TypeScript on the ARM64 architecture.
2. THE System SHALL expose Lambda functions through an AWS API Gateway HTTP API.
3. THE System SHALL use Amazon RDS PostgreSQL with the PostGIS extension as the primary database.
4. THE System SHALL use Amazon S3 for storing parking spot photos.
5. THE System SHALL use Amazon SES for sending transactional emails.
6. THE System SHALL use Amazon SQS for background job processing, including CheckoutLock expiry and email retry.
7. THE System SHALL use AWS Cognito, Clerk, Firebase Auth, or Auth0 for user authentication and JWT issuance.
8. THE System SHALL use RDS Proxy or a connection pooling layer to manage database connections from Lambda.
9. THE System SHALL not store parking spot photos directly in the database; THE System SHALL store only S3 object keys or URLs.

---

### Requirement 18: MVP Definition of Done

**User Story:** As a product team, we want a clear definition of done for the MVP, so that we know when the product is ready to launch.

#### Acceptance Criteria

1. THE System SHALL allow a Driver to search for parking by destination address, date, time, duration, and radius.
2. THE System SHALL allow a Driver to view parking spot details including photos, rules, and entry instructions.
3. THE System SHALL allow a Driver to create a Booking, complete payment via Stripe, and receive a confirmation email.
4. THE System SHALL prevent double bookings through conflict detection and the CheckoutLock mechanism.
5. THE System SHALL allow a Driver to cancel an eligible Booking and receive a refund according to the cancellation policy.
6. THE System SHALL allow a Host to create a listing, add availability rules, and submit the listing for admin review.
7. THE System SHALL allow an Admin to approve or reject a listing, with the listing becoming searchable only after approval.
8. THE System SHALL send email notifications to Drivers and Hosts for all key booking and listing events.
9. THE System SHALL enforce role-based access control so that Drivers, Hosts, and Admins can only access their permitted endpoints.
10. THE System SHALL store HostPayoutRecords for all confirmed Bookings to support future automated payout processing.

---

## Out of Scope for MVP

The following features are explicitly excluded from the MVP and will be addressed in future iterations:

- Venue-Based Parking Hubs (Section 14 of the raw spec)
- Apple Pay, Google Pay, wallet credits, and promo codes
- Automated host payouts and dynamic commission rates
- SMS, push, and WhatsApp notifications
- Host and driver ratings and reviews
- AI-based parking recommendations
- Dynamic or surge pricing
- Calendar sync for availability
- Real-time parking sensor or garage integrations
- License plate recognition
- Event-specific parking pages
- Walking route guidance (post-MVP: replace straight-line distance with walking time)
- Monthly parking subscriptions and corporate accounts

---

### Requirement 19: Guest Checkout

**User Story:** As a driver who doesn't want to create an account, I want to search, book, and pay for parking without registering, so that I can complete my booking with minimal friction.

#### Acceptance Criteria

1. THE System SHALL allow a Driver to search for parking spots and view spot details without authentication.
2. THE System SHALL allow a Driver to complete a booking and payment without creating an account (guest checkout).
3. WHEN a guest books, THE System SHALL require: email address, phone number, vehicle licence plate, booking date/time, and payment information.
4. WHEN a guest booking is created, THE System SHALL create a temporary `users` row with `is_guest = TRUE` and a generated `clerk_user_id` of the form `guest_<uuid>`.
5. THE System SHALL store a `guest_token` (UUID) on the booking to allow the guest to access their booking confirmation without authentication.
6. WHEN a guest booking is confirmed, THE System SHALL send a confirmation email to the guest's email address that includes the booking details and a link to view the booking using the `guest_token`.
7. AFTER a successful guest booking, THE System SHALL prompt the guest to create an account to save their booking history, vehicle details, and enable faster repeat checkout.
8. WHEN a guest chooses to create an account, THE System SHALL redirect them to the Clerk sign-up page with their email pre-filled and a `guestToken` query parameter.
9. THE System SHALL expose `POST /api/v1/auth/claim-guest-account` — an authenticated endpoint that accepts a `guestToken`, finds the matching guest `users` row by email, and updates `clerk_user_id` to the real Clerk user ID and sets `is_guest = FALSE`. All existing bookings and vehicles are automatically associated with the real account.
10. AFTER account claiming, THE System SHALL allow the driver to view their guest booking history in their account's booking list.
11. THE System SHALL expose `GET /api/v1/bookings/guest/:token` — an unauthenticated endpoint that returns booking details for a given `guest_token`.
12. THE System SHALL expose `POST /api/v1/bookings/guest` — an unauthenticated endpoint that accepts guest booking details and creates a booking + payment intent in a single call.
13. Hosts, admins, and users listing parking spots SHALL still require full Clerk authentication.
14. THE System SHALL add `is_guest BOOLEAN NOT NULL DEFAULT FALSE` to the `users` table.
15. THE System SHALL add `guest_token TEXT UNIQUE` to the `bookings` table.
