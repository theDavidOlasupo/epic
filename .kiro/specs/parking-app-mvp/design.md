# Alpaca Parking MVP — Design Document

## Overview

Alpaca Parking is a parking marketplace connecting drivers with hosts who have unused parking spaces. The MVP validates the core marketplace loop in one launch city (Toronto or Vancouver): drivers search by destination and time window, book a spot, and pay via Stripe; hosts list spots and earn money after admin approval.

This document covers the full technical design for the MVP: system architecture, frontend component structure, backend service breakdown, database schema, API design, authentication, payments, background jobs, and testing strategy.

### Key Technical Decisions

| Concern | Decision | Rationale |
|---|---|---|
| Auth provider | **Clerk** | Best-in-class Next.js / App Router integration, pre-built UI components, JWT validation middleware for Lambda, generous free tier |
| Map library | **Google Maps JS API** (`@vis.gl/react-google-maps`)  | Superior POI data for Canadian cities, Places Autocomplete API for address input, consistent pricing model |
| Geocoding | **Google Places API** | Paired with Maps for address autocomplete and lat/lng resolution |
| Database | **PostgreSQL + PostGIS on Amazon RDS** | Geospatial radius queries, relational integrity for bookings/payments |
| Background jobs | **Amazon SQS** | Lock expiry, email retry with DLQ |
| Email | **Amazon SES** | Low cost, AWS-native |
| Storage | **Amazon S3** | Pre-signed upload URLs for photos |
| Connection pooling | **RDS Proxy** | Manages Lambda → RDS connection bursts |
| **Dev environment** | **Local-first** | All development runs locally before any AWS deployment (see below) |

### Local-First Development Strategy

We develop locally first and deploy to AWS only when a meaningful slice is working end-to-end. This keeps the inner dev loop fast and avoids unnecessary AWS costs during early iteration.

| Layer | Local setup | Production (AWS) |
|---|---|---|
| HTTP server | **Hono** on Node.js (`tsx --watch`) | Same Hono handlers wrapped in Lambda adapter |
| Database | **PostgreSQL 16 + PostGIS** via Docker Compose | Amazon RDS PostgreSQL + PostGIS |
| Connection | Direct `node-postgres` connection | Via RDS Proxy |
| Background jobs | In-process async functions or local SQS emulation | Amazon SQS + Lambda trigger |
| Email | Logged to console / [Mailpit](https://github.com/axllent/mailpit) | Amazon SES |
| File storage | Local filesystem or [MinIO](https://min.io/) | Amazon S3 |
| Auth | Clerk (same in both environments — Clerk is cloud-hosted) | Clerk |

**AWS deployment checkpoints:**
- **Checkpoint 1** — After Task 10 (bookings working end-to-end locally): deploy backend Lambdas + RDS to a staging environment
- **Checkpoint 2** — Task 12 (Stripe payments): requires a real HTTPS endpoint for webhooks; use AWS staging or `ngrok` locally
- **Checkpoint 3** — Task 14 (email notifications): wire up SES and SQS in staging
- **Checkpoint 4** — All tasks complete: production deployment

All AWS-specific integrations (SQS, SES, S3, RDS Proxy) are kept behind thin service interfaces so local stubs can be swapped for real implementations without changing business logic.


---

## Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                               │
│                                                                     │
│  ┌──────────────────────────┐   ┌──────────────────────────────┐   │
│  │  Next.js Web App         │   │  Admin Dashboard (Next.js)   │   │
│  │  (React, App Router)     │   │  /admin/* routes             │   │
│  │  Vercel or AWS Amplify   │   │                              │   │
│  └──────────────┬───────────┘   └──────────────┬───────────────┘   │
└─────────────────┼────────────────────────────────┼─────────────────┘
                  │ HTTPS / Bearer JWT             │
┌─────────────────▼────────────────────────────────▼─────────────────┐
│                       AWS API GATEWAY HTTP API                      │
│                    /api/v1/*  and  /api/v1/admin/*                  │
│                    Rate limiting via Usage Plans                    │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ Lambda Proxy Integration
┌─────────────────────────────▼───────────────────────────────────────┐
│                        AWS LAMBDA FUNCTIONS                         │
│                     Node.js 20 / TypeScript / ARM64                 │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │  Search  │ │Bookings  │ │Payments  │ │Listings  │ │  Admin   │ │
│  │ Handler  │ │ Handler  │ │ Handler  │ │ Handler  │ │ Handler  │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ │
└───────┼────────────┼────────────┼────────────┼────────────┼────────┘
        │            │            │            │            │
┌───────▼────────────▼────────────▼────────────▼────────────▼────────┐
│                         SERVICE LAYER                               │
│  SearchService │ BookingService │ PaymentService │ ListingService   │
│  AvailabilityService │ NotificationService │ UserService            │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
┌───────▼──────┐   ┌────────────▼──────────┐   ┌───────▼──────────┐
│  RDS Proxy   │   │   Amazon SQS          │   │  External APIs   │
│              │   │   - lock-expiry-queue │   │  - Clerk (auth)  │
│  Amazon RDS  │   │   - email-queue       │   │  - Stripe        │
│  PostgreSQL  │   │   - email-dlq         │   │  - Google Maps   │
│  + PostGIS   │   └────────────┬──────────┘   │  - Google Places │
└──────────────┘                │              │  - AWS SES       │
                    ┌───────────▼──────────┐   │  - AWS S3        │
                    │  SQS Worker Lambda   │   └──────────────────┘
                    │  (lock expiry +      │
                    │   email retry)       │
                    └──────────────────────┘
```

### Request Flow

1. Client sends `Authorization: Bearer <clerk_jwt>` with every authenticated request.
2. API Gateway forwards to the appropriate Lambda handler.
3. Lambda middleware validates the JWT against Clerk's JWKS endpoint (cached in-memory).
4. Middleware extracts `userId`, `role`, and `status` from the token claims and attaches them to the request context.
5. Route handler calls the relevant service, which queries RDS via RDS Proxy using a connection pool (pg / node-postgres).
6. Service returns a result; handler serialises to JSON and returns an API Gateway proxy response.

### Lambda Function Organisation

Rather than one Lambda per endpoint (which creates cold-start sprawl), the MVP uses **one Lambda per domain** with internal routing via a lightweight router (e.g. `hono` or a thin custom router):

| Lambda | Routes handled |
|---|---|
| `parking-spots-fn` | `/api/v1/parking-spots/*` |
| `bookings-fn` | `/api/v1/bookings/*`, `/api/v1/users/me/bookings` |
| `payments-fn` | `/api/v1/payments/*` |
| `users-fn` | `/api/v1/users/me/*` |
| `admin-fn` | `/api/v1/admin/*` |
| `sqs-worker-fn` | Triggered by SQS events (lock expiry, email retry) |

Each Lambda is bundled with esbuild and deployed via AWS SAM or CDK.


---

## Components and Interfaces

### Frontend Component Structure

The frontend is a Next.js 14+ App Router application. Pages live under `app/` and reusable components under `components/`.

```
app/
├── (public)/
│   ├── page.tsx                    # Landing / home
│   └── parking/[id]/page.tsx       # Spot detail page
├── (auth)/
│   ├── sign-in/page.tsx
│   └── sign-up/page.tsx
├── (driver)/
│   ├── search/page.tsx             # Search page (Airbnb-style)
│   ├── bookings/page.tsx           # My bookings list
│   └── bookings/[id]/page.tsx      # Booking detail
├── (host)/
│   ├── listings/page.tsx           # Host's listings
│   ├── listings/new/page.tsx       # Create listing wizard
│   ├── listings/[id]/edit/page.tsx # Edit listing
│   └── listings/[id]/bookings/page.tsx
├── (admin)/
│   ├── admin/listings/page.tsx     # Pending listings queue
│   ├── admin/listings/[id]/page.tsx
│   ├── admin/bookings/page.tsx
│   └── admin/users/page.tsx
└── api/                            # Next.js API routes (thin proxies or webhooks only)

components/
├── search/
│   ├── SearchBar.tsx               # "Where" + "When" inputs + Search button
│   ├── WhereInput.tsx              # Google Places Autocomplete
│   ├── WhenPicker.tsx              # Date + time range picker
│   ├── SearchResultsPage.tsx       # Split-view container
│   ├── MapView.tsx                 # Google Maps with price pins
│   ├── SpotCard.tsx                # List card (price, distance, type, photo)
│   ├── SpotPin.tsx                 # Map marker with price label
│   └── FilterBar.tsx               # Price / distance / type filters
├── spot/
│   ├── SpotDetailHero.tsx          # Photo carousel + title + price
│   ├── SpotMap.tsx                 # Static map showing spot location
│   ├── SpotRules.tsx               # Rules, restrictions, entry instructions
│   ├── HostCard.tsx                # Host name + phone verified badge
│   └── BookingWidget.tsx           # Date/time picker + "Reserve" CTA
├── booking/
│   ├── CheckoutModal.tsx           # Checkout lock + Stripe Elements
│   ├── BookingCard.tsx             # Upcoming/past booking summary
│   └── BookingDetail.tsx           # Full booking detail view
├── listing/
│   ├── ListingWizard.tsx           # Multi-step host listing form
│   ├── PhotoUploader.tsx           # S3 pre-signed upload UI
│   ├── AvailabilityEditor.tsx      # Weekly rules + blocked dates
│   └── ListingStatusBadge.tsx
├── admin/
│   ├── PendingListingCard.tsx
│   ├── ApproveRejectPanel.tsx
│   └── UserStatusControl.tsx
└── shared/
    ├── ErrorBoundary.tsx
    ├── LoadingSpinner.tsx
    └── PriceDisplay.tsx
```

### Search Page — Airbnb-Style Layout

The search page (`/search`) renders in two phases:

**Phase 1 — Search Bar (pre-search)**

A centred search bar with two inputs and a search button, styled similarly to Airbnb's hero search:

```
┌─────────────────────────────────────────────────────────┐
│  🅿  Alpaca Parking                                      │
│                                                         │
│  ┌──────────────────┬──────────────────┬─────────────┐  │
│  │  📍 Where        │  📅 When         │  🔍 Search  │  │
│  │  Destination...  │  Date · Time     │             │  │
│  └──────────────────┴──────────────────┴─────────────┘  │
└─────────────────────────────────────────────────────────┘
```

- **Where**: `WhereInput` wraps the Google Places Autocomplete widget. On selection, it stores the place's `lat/lng` and formatted address in component state.
- **When**: `WhenPicker` opens a date picker followed by start-time and end-time selectors (30-minute increments).

**Phase 2 — Split View (post-search)**

After the user clicks Search, the page transitions to a split layout:

```
┌──────────────────────────────────────────────────────────┐
│  SearchBar (compact, pinned top)                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │                                                  │   │
│  │           Google Maps                            │   │
│  │   (pins show price labels, e.g. "$8/hr")         │   │
│  │   Active pin highlighted in dark                 │   │
│  │                                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  FilterBar  [Max price ▼] [Distance ▼] [Type ▼]  │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  SpotCard  (photo, title, distance, price, type) │   │
│  │  SpotCard                                        │   │
│  │  SpotCard                                        │   │
│  │  ...scrollable list                              │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Pin ↔ Card Interaction**:
- `MapView` maintains `hoveredSpotId` state.
- Clicking a map pin sets `hoveredSpotId`, which scrolls the list to the matching `SpotCard` and applies a highlight style.
- Hovering a `SpotCard` sets `hoveredSpotId`, which changes the corresponding map pin to the active/dark style.
- Both components receive `hoveredSpotId` and `onHover` as props from the shared `SearchResultsPage` parent.

### Spot Detail Page

`/parking/[id]` — server-rendered (Next.js RSC) for SEO, with a client-side `BookingWidget` for interactivity.

Layout:
1. Photo carousel (full-width hero)
2. Title, address, type badge, price per hour
3. `SpotMap` — small embedded Google Map centred on the spot
4. Rules, vehicle restrictions, entry instructions
5. `HostCard` — host name + phone-verified badge
6. Cancellation policy
7. Sticky `BookingWidget` (right column on desktop, bottom sheet on mobile) — date/time picker → "Reserve" button

### Booking Flow

1. Driver selects dates in `BookingWidget` → clicks "Reserve"
2. `POST /api/v1/bookings` → creates pending booking, returns `bookingId`
3. `POST /api/v1/bookings/:id/checkout-lock` → acquires 10-minute lock
4. `CheckoutModal` opens with Stripe Elements (card input)
5. `POST /api/v1/payments/create-intent` → returns `clientSecret`
6. Stripe.js `confirmCardPayment(clientSecret)` → payment completes client-side
7. Stripe webhook fires `payment_intent.succeeded` → Lambda confirms booking, sends emails
8. Client polls `GET /api/v1/bookings/:id` or listens for redirect to `/bookings/:id` confirmation page

### Host Listing Flow

Multi-step wizard (`ListingWizard`):
1. **Location** — address input (Google Places), map pin confirmation
2. **Details** — type, price, covered/overnight, vehicle restrictions
3. **Photos** — `PhotoUploader` requests pre-signed URL, uploads directly to S3, sends key back
4. **Availability** — `AvailabilityEditor` for weekly rules + blocked dates
5. **Review & Submit** — summary, then `POST .../submit-review`

### Admin Dashboard

Protected by Clerk's `auth()` with role check (`role === 'admin'`). Key views:
- **Pending Listings** — paginated list with approve/reject actions
- **All Bookings** — filterable table
- **Users** — search by email, suspend/ban/reactivate


---

## Data Models

### PostgreSQL Schema (with PostGIS)

All tables use `uuid` primary keys generated by `gen_random_uuid()`. Timestamps are `timestamptz` stored in UTC.

```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id     TEXT UNIQUE NOT NULL,          -- Clerk's external user ID
  email             TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  phone_number      TEXT,
  role              TEXT NOT NULL CHECK (role IN ('driver', 'host', 'admin')),
  status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'suspended', 'banned')),
  email_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- VEHICLES
-- ─────────────────────────────────────────────
CREATE TABLE vehicles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make                  TEXT NOT NULL,
  model                 TEXT NOT NULL,
  year                  SMALLINT NOT NULL,
  size_class            TEXT NOT NULL CHECK (size_class IN (
                          'compact','mid_size','full_size','suv','truck','van','motorcycle')),
  licence_plate         TEXT NOT NULL,
  licence_plate_region  TEXT NOT NULL,
  is_default            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vehicles_user_id ON vehicles(user_id);

-- ─────────────────────────────────────────────
-- PARKING SPOTS
-- ─────────────────────────────────────────────
CREATE TABLE parking_spots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id               UUID NOT NULL REFERENCES users(id),
  title                 TEXT NOT NULL,
  address               TEXT NOT NULL,
  location              GEOGRAPHY(POINT, 4326) NOT NULL,  -- PostGIS point
  latitude              DOUBLE PRECISION NOT NULL,         -- denormalised for fast reads
  longitude             DOUBLE PRECISION NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN (
                          'driveway','garage','lot','underground','other')),
  price_per_hour        INTEGER NOT NULL,                  -- cents (e.g. 800 = $8.00)
  photos                TEXT[] NOT NULL DEFAULT '{}',      -- S3 keys
  rules                 TEXT[] NOT NULL DEFAULT '{}',
  entry_instructions    TEXT NOT NULL DEFAULT '',
  max_vehicle_size      TEXT CHECK (max_vehicle_size IN (
                          'compact','mid_size','full_size','suv','truck','van')),
  height_restriction_cm INTEGER,
  is_covered            BOOLEAN NOT NULL DEFAULT FALSE,
  allow_overnight       BOOLEAN NOT NULL DEFAULT FALSE,
  cancellation_policy   TEXT NOT NULL DEFAULT 'standard',
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN (
                            'draft','pending_review','active','paused','rejected')),
  rejection_reason      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial index for radius queries
CREATE INDEX idx_parking_spots_location ON parking_spots USING GIST(location);
CREATE INDEX idx_parking_spots_status ON parking_spots(status);
CREATE INDEX idx_parking_spots_host_id ON parking_spots(host_id);

-- ─────────────────────────────────────────────
-- AVAILABILITY RULES (recurring weekly)
-- ─────────────────────────────────────────────
CREATE TABLE availability_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parking_spot_id UUID NOT NULL REFERENCES parking_spots(id) ON DELETE CASCADE,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time      TIME NOT NULL,   -- local time in timezone
  end_time        TIME NOT NULL,
  timezone        TEXT NOT NULL,   -- IANA, e.g. 'America/Toronto'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_availability_rules_spot ON availability_rules(parking_spot_id);

-- ─────────────────────────────────────────────
-- AVAILABILITY BLOCKS (one-off overrides)
-- ─────────────────────────────────────────────
CREATE TABLE availability_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parking_spot_id UUID NOT NULL REFERENCES parking_spots(id) ON DELETE CASCADE,
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_availability_blocks_spot_time
  ON availability_blocks(parking_spot_id, start_time, end_time);

-- ─────────────────────────────────────────────
-- BOOKINGS
-- ─────────────────────────────────────────────
CREATE TABLE bookings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id                 UUID NOT NULL REFERENCES users(id),
  parking_spot_id           UUID NOT NULL REFERENCES parking_spots(id),
  vehicle_id                UUID NOT NULL REFERENCES vehicles(id),
  start_time                TIMESTAMPTZ NOT NULL,
  end_time                  TIMESTAMPTZ NOT NULL,
  total_price               INTEGER NOT NULL,   -- cents
  currency                  CHAR(3) NOT NULL DEFAULT 'CAD',
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN (
                                'pending','confirmed','cancelled','expired','payment_failed')),
  stripe_payment_intent_id  TEXT,
  cancellation_reason       TEXT,
  cancelled_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exclusion constraint prevents overlapping confirmed bookings for the same spot
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE UNIQUE INDEX idx_bookings_no_overlap
  ON bookings(parking_spot_id, tstzrange(start_time, end_time))
  WHERE status = 'confirmed';

-- Note: the above uses a partial unique index on a range expression.
-- For full exclusion semantics use an EXCLUDE constraint:
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING GIST (
    parking_spot_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status = 'confirmed');

CREATE INDEX idx_bookings_driver_id ON bookings(driver_id);
CREATE INDEX idx_bookings_spot_id ON bookings(parking_spot_id);
CREATE INDEX idx_bookings_status ON bookings(status);

-- ─────────────────────────────────────────────
-- CHECKOUT LOCKS
-- ─────────────────────────────────────────────
CREATE TABLE checkout_locks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parking_spot_id UUID NOT NULL REFERENCES parking_spots(id),
  driver_id       UUID NOT NULL REFERENCES users(id),
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent overlapping active locks for the same spot
ALTER TABLE checkout_locks ADD CONSTRAINT checkout_locks_no_overlap
  EXCLUDE USING GIST (
    parking_spot_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (expires_at > NOW());

CREATE INDEX idx_checkout_locks_spot ON checkout_locks(parking_spot_id);
CREATE INDEX idx_checkout_locks_driver ON checkout_locks(driver_id);
CREATE INDEX idx_checkout_locks_expires ON checkout_locks(expires_at);

-- ─────────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────────
CREATE TABLE payments (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                  UUID NOT NULL REFERENCES bookings(id),
  driver_id                   UUID NOT NULL REFERENCES users(id),
  amount                      INTEGER NOT NULL,   -- cents
  currency                    CHAR(3) NOT NULL,
  provider                    TEXT NOT NULL DEFAULT 'stripe',
  provider_payment_intent_id  TEXT UNIQUE NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'requires_payment'
                                CHECK (status IN (
                                  'requires_payment','processing',
                                  'succeeded','failed','refunded')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_booking_id ON payments(booking_id);
CREATE INDEX idx_payments_intent_id ON payments(provider_payment_intent_id);

-- ─────────────────────────────────────────────
-- HOST PAYOUT RECORDS
-- ─────────────────────────────────────────────
CREATE TABLE host_payout_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          UUID NOT NULL REFERENCES bookings(id),
  host_id             UUID NOT NULL REFERENCES users(id),
  gross_amount        INTEGER NOT NULL,
  platform_fee_amount INTEGER NOT NULL,
  host_earnings       INTEGER NOT NULL,
  currency            CHAR(3) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','paid','cancelled')),
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payout_records_host_id ON host_payout_records(host_id);
CREATE INDEX idx_payout_records_booking_id ON host_payout_records(booking_id);

-- ─────────────────────────────────────────────
-- OTP RECORDS (phone verification)
-- ─────────────────────────────────────────────
CREATE TABLE otp_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,   -- bcrypt hash of the 6-digit OTP
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_user_id ON otp_records(user_id);
```

### TypeScript Domain Types (shared package `@alpaca/types`)

The shared types package lives at `packages/types/` in a monorepo and is imported by both the Next.js frontend and the Lambda functions.

```typescript
// packages/types/src/index.ts

export type UserRole = 'driver' | 'host' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'banned';
export type SpotType = 'driveway' | 'garage' | 'lot' | 'underground' | 'other';
export type VehicleSizeClass =
  | 'compact' | 'mid_size' | 'full_size' | 'suv' | 'truck' | 'van' | 'motorcycle';
export type BookingStatus =
  | 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'payment_failed';
export type PaymentStatus =
  | 'requires_payment' | 'processing' | 'succeeded' | 'failed' | 'refunded';
export type ListingStatus =
  | 'draft' | 'pending_review' | 'active' | 'paused' | 'rejected';
export type PayoutStatus = 'pending' | 'paid' | 'cancelled';

export interface User {
  id: string;
  email: string;
  name: string;
  phoneNumber?: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  userId: string;
  make: string;
  model: string;
  year: number;
  sizeClass: VehicleSizeClass;
  licencePlate: string;
  licencePlateRegion: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ParkingSpot {
  id: string;
  hostId: string;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  type: SpotType;
  pricePerHour: number;       // cents
  photos: string[];
  rules: string[];
  entryInstructions: string;
  maxVehicleSize?: VehicleSizeClass;
  heightRestrictionCm?: number;
  isCovered: boolean;
  allowOvernight: boolean;
  cancellationPolicy: 'standard';
  status: ListingStatus;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParkingSearchResult {
  id: string;
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  type: SpotType;
  pricePerHour: number;
  distanceMeters: number;
  isCovered: boolean;
  isAvailable: boolean;
  primaryPhotoUrl: string | null;
}

export interface Booking {
  id: string;
  driverId: string;
  parkingSpotId: string;
  vehicleId: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  currency: string;
  status: BookingStatus;
  stripePaymentIntentId?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutLock {
  id: string;
  parkingSpotId: string;
  driverId: string;
  startTime: string;
  endTime: string;
  expiresAt: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  driverId: string;
  amount: number;
  currency: string;
  provider: 'stripe';
  providerPaymentIntentId: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface HostPayoutRecord {
  id: string;
  bookingId: string;
  hostId: string;
  grossAmount: number;
  platformFeeAmount: number;
  hostEarnings: number;
  currency: string;
  status: PayoutStatus;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityRule {
  id: string;
  parkingSpotId: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;   // HH:MM
  endTime: string;
  timezone: string;
}

export interface AvailabilityBlock {
  id: string;
  parkingSpotId: string;
  startTime: string;
  endTime: string;
  reason?: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ── Request / Response shapes ──────────────────────────────────────────────

export interface SearchParkingRequest {
  latitude: number;
  longitude: number;
  radiusKm: number;
  startTime: string;
  endTime: string;
  maxPricePerHour?: number;
  maxDistanceMeters?: number;
  type?: SpotType;
}

export interface SearchParkingResponse {
  spots: ParkingSearchResult[];
  total: number;
}

export interface CreateBookingRequest {
  parkingSpotId: string;
  vehicleId: string;
  startTime: string;
  endTime: string;
}

export interface CreatePaymentIntentRequest {
  bookingId: string;
}

export interface CreatePaymentIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}
```


---

## Key API Endpoint Designs

All endpoints are under `/api/v1`. Admin endpoints are under `/api/v1/admin`. All responses follow the standard shape; errors follow `ErrorResponse`.

### Authentication & Users

```
GET  /api/v1/users/me
  → Returns the authenticated user's profile (User)

PUT  /api/v1/users/me
  Body: { name?, phoneNumber? }
  → Updates profile fields

POST /api/v1/users/me/vehicles
  Body: { make, model, year, sizeClass, licencePlate, licencePlateRegion, isDefault? }
  → 201 Created with Vehicle

GET  /api/v1/users/me/vehicles
  → Returns Vehicle[]

DELETE /api/v1/users/me/vehicles/:vehicleId
  → 200 OK or 422 VEHICLE_IN_USE

POST /api/v1/auth/verify-phone
  Body: { phoneNumber }
  → Sends OTP via SNS/SMS, 200 OK

POST /api/v1/auth/confirm-phone
  Body: { phoneNumber, otp }
  → 200 OK or 422 INVALID_OTP
```

### Parking Spots

```
GET /api/v1/parking-spots/search
  Query: lat, lng, radiusKm, startTime, endTime, maxPricePerHour?, maxDistanceMeters?, type?
  → SearchParkingResponse
  Notes:
    - Geocoding happens client-side (Google Places) before this call
    - PostGIS ST_DWithin for radius filter
    - Excludes spots with overlapping confirmed bookings or active blocks
    - Sorted by distance ASC by default

GET /api/v1/parking-spots/:id
  → Full ParkingSpot + host info (name, phoneVerified)
  → 404 if not found or not active (for driver requests)

POST /api/v1/parking-spots
  Auth: host role required
  Body: { title, address, latitude, longitude, type, pricePerHour, entryInstructions,
          isCovered, allowOvernight, maxVehicleSize?, heightRestrictionCm?, rules? }
  → 201 Created with ParkingSpot (status: 'draft')

PUT /api/v1/parking-spots/:id
  Auth: host role, must own spot, status must be 'draft' or 'rejected'
  Body: partial ParkingSpot fields
  → 200 OK or 422 LISTING_NOT_EDITABLE

POST /api/v1/parking-spots/:id/submit-review
  Auth: host role, must own spot
  → Sets status to 'pending_review', 200 OK

POST /api/v1/parking-spots/:id/pause
  Auth: host role, must own spot, status must be 'active'
  → Sets status to 'paused', 200 OK

POST /api/v1/parking-spots/:id/photos/upload-url
  Auth: host role, must own spot
  Body: { filename, contentType }
  → { uploadUrl: string, key: string }
  Notes: generates S3 pre-signed PUT URL (15-min expiry)

POST /api/v1/parking-spots/:id/availability-rules
  Auth: host role, must own spot
  Body: { dayOfWeek, startTime, endTime, timezone }
  → 201 Created with AvailabilityRule

DELETE /api/v1/parking-spots/:id/availability-rules/:ruleId
  Auth: host role, must own spot
  → 200 OK

POST /api/v1/parking-spots/:id/availability-blocks
  Auth: host role, must own spot
  Body: { startTime, endTime, reason? }
  → 201 Created or 422 BLOCK_CONFLICTS_WITH_BOOKING

DELETE /api/v1/parking-spots/:id/availability-blocks/:blockId
  Auth: host role, must own spot
  → 200 OK
```

### Bookings

```
POST /api/v1/bookings
  Auth: driver role
  Body: { parkingSpotId, vehicleId, startTime, endTime }
  → 201 Created with Booking (status: 'pending')
  Validations:
    - Driver has at least one vehicle (422 VEHICLE_REQUIRED)
    - vehicleId belongs to driver
    - No overlapping confirmed booking (409 BOOKING_CONFLICT)
    - Spot is active
    - Time window within availability rules and not blocked
    - totalPrice = ceil(pricePerHour * durationHours)

GET /api/v1/bookings/:id
  Auth: driver (own booking) or admin
  → Full Booking + spot address + entry instructions + host rules + cancellation policy

POST /api/v1/bookings/:id/checkout-lock
  Auth: driver (must own booking)
  → 201 Created with CheckoutLock (expiresAt = now + 10 min)
  Validations:
    - No overlapping active lock for same spot/time (409 SPOT_LOCKED)
    - Driver has < 3 active locks (422 TOO_MANY_ACTIVE_LOCKS)
    - Enqueues SQS message with delay = 10 min for lock expiry

POST /api/v1/bookings/:id/cancel
  Auth: driver (own booking) or admin
  Body: { reason? }
  → 200 OK with updated Booking
  Logic:
    - If now < startTime - 1hr: full refund via Stripe, Payment status → 'refunded'
    - Else: no refund
    - Booking status → 'cancelled', cancellationReason, cancelledAt set
    - HostPayoutRecord status → 'cancelled' (if refunded) or stays 'pending'
    - 422 BOOKING_NOT_CANCELLABLE if status is expired/payment_failed/cancelled

GET /api/v1/users/me/bookings
  Auth: driver
  Query: filter=upcoming|past (default: all)
  → Booking[]
```

### Payments

```
POST /api/v1/payments/create-intent
  Auth: driver
  Body: { bookingId }
  → { clientSecret, paymentIntentId }
  Notes:
    - Creates Stripe PaymentIntent with amount = booking.totalPrice, currency
    - Stores Payment record (status: 'requires_payment')
    - Updates booking.stripePaymentIntentId

POST /api/v1/payments/webhook
  Auth: Stripe-Signature header verification (HMAC)
  Body: Stripe event payload
  Handles:
    - payment_intent.succeeded:
        Booking → 'confirmed'
        Payment → 'succeeded'
        HostPayoutRecord created (status: 'pending')
        Enqueues confirmation emails to driver + host
    - payment_intent.payment_failed:
        Booking → 'payment_failed'
        Payment → 'failed'
```

### Admin Endpoints

```
GET  /api/v1/admin/listings/pending
  Auth: admin role
  Query: page, limit
  → ParkingSpot[] with status 'pending_review'

POST /api/v1/admin/listings/:id/approve
  Auth: admin role
  → Spot status → 'active', sends approval email via SES

POST /api/v1/admin/listings/:id/reject
  Auth: admin role
  Body: { reason }
  → Spot status → 'rejected', rejectionReason set, sends rejection email

POST /api/v1/admin/listings/:id/pause
  Auth: admin role
  → Spot status → 'paused'

GET  /api/v1/admin/bookings
  Auth: admin role
  Query: page, limit, status?, driverId?, spotId?
  → Booking[]

GET  /api/v1/admin/users
  Auth: admin role
  Query: page, limit, role?, status?
  → User[]

PUT  /api/v1/admin/users/:id/status
  Auth: admin role
  Body: { status: 'active' | 'suspended' | 'banned' }
  → Updated User
```

### Search Query — PostGIS Implementation

```sql
-- Core search query (parameterised)
SELECT
  ps.id,
  ps.title,
  ps.address,
  ps.latitude,
  ps.longitude,
  ps.type,
  ps.price_per_hour,
  ps.is_covered,
  ps.photos[1] AS primary_photo_key,
  ST_Distance(
    ps.location::geography,
    ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography
  ) AS distance_meters
FROM parking_spots ps
WHERE
  ps.status = 'active'
  AND ST_DWithin(
    ps.location::geography,
    ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography,
    $radius_meters
  )
  -- Exclude spots with overlapping confirmed bookings
  AND NOT EXISTS (
    SELECT 1 FROM bookings b
    WHERE b.parking_spot_id = ps.id
      AND b.status = 'confirmed'
      AND b.start_time < $end_time
      AND b.end_time > $start_time
  )
  -- Exclude spots with overlapping availability blocks
  AND NOT EXISTS (
    SELECT 1 FROM availability_blocks ab
    WHERE ab.parking_spot_id = ps.id
      AND ab.start_time < $end_time
      AND ab.end_time > $start_time
  )
  -- Optional filters
  AND ($max_price IS NULL OR ps.price_per_hour <= $max_price)
  AND ($type IS NULL OR ps.type = $type)
ORDER BY distance_meters ASC
LIMIT 50;
```


---

## Authentication and Authorization Design

### Provider: Clerk

Clerk is chosen for the following reasons:
- First-class Next.js App Router integration (`@clerk/nextjs`) with `auth()` server-side helper and `useAuth()` client hook
- Pre-built `<SignIn>` and `<SignUp>` components that handle email verification flows out of the box
- JWT access tokens are standard RS256-signed JWTs verifiable with Clerk's JWKS endpoint
- Lambda middleware can verify tokens using `@clerk/backend` or the lightweight `jose` library with Clerk's JWKS URL
- Generous free tier (10,000 MAU)

### JWT Validation in Lambda

```typescript
// src/middleware/auth.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL(`https://clerk.your-domain.com/.well-known/jwks.json`)
);

export async function verifyToken(token: string): Promise<ClerkJWTPayload> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: process.env.CLERK_ISSUER,
  });
  return payload as ClerkJWTPayload;
}
```

The JWKS set is cached in-memory for the Lambda instance lifetime (warm invocations reuse it). Cold starts fetch it once.

### Custom Claims

Clerk's JWT template is configured to include custom claims:

```json
{
  "userId": "{{user.public_metadata.internalId}}",
  "role": "{{user.public_metadata.role}}",
  "status": "{{user.public_metadata.status}}"
}
```

On user creation (Clerk webhook `user.created`), the backend creates a `users` row and writes `internalId`, `role`, and `status` back to Clerk's `publicMetadata` via the Clerk Backend API.

### Role-Based Access Control

Each Lambda handler applies a middleware chain:

```typescript
// Middleware chain example
handler = compose(
  parseBody,
  authenticate,          // validates JWT, attaches req.user
  requireRole('driver'), // 403 if wrong role
  checkAccountStatus,    // 403 ACCOUNT_SUSPENDED / ACCOUNT_BANNED
  routeHandler
);
```

Role enforcement rules:
- `driver` role: can create bookings, view own bookings, manage own vehicles
- `host` role: can create/edit own listings, view own listing bookings
- `admin` role: can access all `/api/v1/admin/*` endpoints, manage any listing/user
- A user can only hold one role (assigned at registration)

### Email Verification

Clerk handles email verification natively. The `emailVerified` field on the `users` table is synced via Clerk webhooks (`user.updated`).

### Phone Verification (Host OTP)

Phone verification is handled by the backend (not Clerk) using AWS SNS for SMS delivery:

1. `POST /api/v1/auth/verify-phone` — backend generates a 6-digit OTP, hashes it with bcrypt, stores in `otp_records` with 10-minute expiry, sends SMS via SNS
2. `POST /api/v1/auth/confirm-phone` — backend looks up the latest unused OTP for the user, verifies the hash, marks `users.phone_verified = true`

### Rate Limiting

Rate limiting is implemented at two levels:

1. **API Gateway** — Usage Plans with throttling (100 req/min per API key for authenticated, 20 req/min for unauthenticated)
2. **Lambda middleware** — Redis-backed (ElastiCache) sliding window counter for per-user limits and login attempt tracking

For MVP simplicity, a lightweight in-memory approach using DynamoDB as a counter store is acceptable if ElastiCache adds too much cost.

Login attempt locking:
```typescript
// Pseudo-code
const key = `login_attempts:${email}`;
const attempts = await incrementCounter(key, ttl=900); // 15 min window
if (attempts > 5) throw new AppError('ACCOUNT_TEMPORARILY_LOCKED', 429);
```


---

## Stripe Payment Flow Design

### Flow Diagram

```
Driver                  Frontend              Backend Lambda          Stripe
  │                        │                       │                    │
  │  Clicks "Reserve"      │                       │                    │
  │──────────────────────► │                       │                    │
  │                        │  POST /bookings       │                    │
  │                        │──────────────────────►│                    │
  │                        │  201 { bookingId }    │                    │
  │                        │◄──────────────────────│                    │
  │                        │  POST /checkout-lock  │                    │
  │                        │──────────────────────►│                    │
  │                        │  201 { expiresAt }    │                    │
  │                        │◄──────────────────────│                    │
  │                        │  POST /create-intent  │                    │
  │                        │──────────────────────►│                    │
  │                        │                       │  Create PI         │
  │                        │                       │───────────────────►│
  │                        │                       │  { clientSecret }  │
  │                        │                       │◄───────────────────│
  │                        │  { clientSecret }     │                    │
  │                        │◄──────────────────────│                    │
  │  Enters card details   │                       │                    │
  │──────────────────────► │                       │                    │
  │                        │  stripe.confirmCard() │                    │
  │                        │───────────────────────────────────────────►│
  │                        │                       │                    │
  │                        │                       │  webhook: PI.succeeded
  │                        │                       │◄───────────────────│
  │                        │                       │  Booking→confirmed │
  │                        │                       │  Emails enqueued   │
  │                        │                       │                    │
  │  Redirect to /bookings/:id (confirmed)         │                    │
```

### PaymentIntent Configuration

```typescript
const paymentIntent = await stripe.paymentIntents.create({
  amount: booking.totalPrice,          // cents
  currency: booking.currency.toLowerCase(),
  metadata: {
    bookingId: booking.id,
    driverId: booking.driverId,
    parkingSpotId: booking.parkingSpotId,
  },
  automatic_payment_methods: { enabled: true },
  capture_method: 'automatic',
});
```

### Webhook Handler

The webhook endpoint (`POST /api/v1/payments/webhook`) is **unauthenticated** but verifies the Stripe signature:

```typescript
const event = stripe.webhooks.constructEvent(
  rawBody,                          // must be raw Buffer, not parsed JSON
  req.headers['stripe-signature'],
  process.env.STRIPE_WEBHOOK_SECRET
);
```

Handled events:
- `payment_intent.succeeded` → confirm booking, create HostPayoutRecord, enqueue emails
- `payment_intent.payment_failed` → mark booking `payment_failed`, mark payment `failed`

### Refund Flow

```typescript
// Cancellation with refund
const refund = await stripe.refunds.create({
  payment_intent: booking.stripePaymentIntentId,
  reason: 'requested_by_customer',
});

await db.transaction(async (trx) => {
  await trx('payments').where({ booking_id: bookingId })
    .update({ status: 'refunded', updated_at: new Date() });
  await trx('bookings').where({ id: bookingId })
    .update({ status: 'cancelled', cancelled_at: new Date(), cancellation_reason: reason });
  await trx('host_payout_records').where({ booking_id: bookingId })
    .update({ status: 'cancelled', updated_at: new Date() });
});
```

### Platform Fee Calculation

For MVP, the platform fee is a fixed 15% of the gross amount:

```typescript
const PLATFORM_FEE_RATE = 0.15;

function calculatePayout(grossAmount: number): HostPayoutRecord {
  const platformFeeAmount = Math.round(grossAmount * PLATFORM_FEE_RATE);
  const hostEarnings = grossAmount - platformFeeAmount;
  return { grossAmount, platformFeeAmount, hostEarnings };
}
```


---

## Checkout Lock Concurrency Design

### Problem

Multiple drivers may attempt to book the same parking spot for the same time window simultaneously. The system must prevent double-booking while allowing a driver to hold a spot during the payment flow.

### Two-Layer Protection

**Layer 1 — CheckoutLock (soft hold, 10 minutes)**

When a driver initiates checkout, a `CheckoutLock` is created. The PostgreSQL `EXCLUDE` constraint on `checkout_locks` prevents two overlapping locks for the same spot from being created concurrently:

```sql
ALTER TABLE checkout_locks ADD CONSTRAINT checkout_locks_no_overlap
  EXCLUDE USING GIST (
    parking_spot_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (expires_at > NOW());
```

If the constraint is violated, PostgreSQL raises an error that the backend maps to `409 SPOT_LOCKED`.

**Layer 2 — Booking Exclusion Constraint (hard lock, permanent)**

When a booking is confirmed, the `bookings` table `EXCLUDE` constraint prevents any overlapping confirmed booking:

```sql
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING GIST (
    parking_spot_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status = 'confirmed');
```

This is the definitive guard. Even if two requests race past the application-level check, only one can win the database constraint.

### Lock Expiry via SQS

When a `CheckoutLock` is created, the backend enqueues an SQS message with a **delay of 600 seconds** (10 minutes):

```typescript
await sqs.sendMessage({
  QueueUrl: process.env.LOCK_EXPIRY_QUEUE_URL,
  MessageBody: JSON.stringify({ lockId, bookingId }),
  DelaySeconds: 600,
}).promise();
```

The SQS Worker Lambda processes the message:

```typescript
export async function handleLockExpiry(event: SQSEvent) {
  for (const record of event.Records) {
    const { lockId, bookingId } = JSON.parse(record.body);

    await db.transaction(async (trx) => {
      const lock = await trx('checkout_locks').where({ id: lockId }).first();
      if (!lock) return; // already deleted (booking confirmed)

      // Only expire if lock hasn't been superseded
      if (lock.expires_at <= new Date()) {
        await trx('checkout_locks').where({ id: lockId }).delete();
        await trx('bookings')
          .where({ id: bookingId, status: 'pending' })
          .update({ status: 'expired', updated_at: new Date() });
      }
    });
  }
}
```

### Lock Hoarding Prevention

A driver may hold at most 3 active `CheckoutLock` records at any time (Requirement 15.6). This is checked at lock creation time:

```typescript
const activeLocks = await db('checkout_locks')
  .where({ driver_id: driverId })
  .where('expires_at', '>', new Date())
  .count('id as count');

if (Number(activeLocks[0].count) >= 3) {
  throw new AppError('TOO_MANY_ACTIVE_LOCKS', 422);
}
```

### Search Exclusion of Locked Spots

The search query does **not** exclude spots with active `CheckoutLock` records. This is intentional: a lock is a soft hold during payment, not a confirmed booking. If the lock expires, the spot becomes available again. Excluding locked spots from search would create a poor UX where spots appear unavailable for 10 minutes due to abandoned checkouts.

The conflict is caught at booking creation time (Layer 1) and at payment confirmation time (Layer 2).


---

## Background Job Design

### SQS Queues

| Queue | Purpose | Visibility Timeout | DLQ Retries |
|---|---|---|---|
| `lock-expiry-queue` | Expire stale CheckoutLocks | 30s | 3 |
| `email-queue` | Send transactional emails via SES | 60s | 3 |
| `email-dlq` | Dead-letter for failed email sends | — | logged |

### SQS Worker Lambda

The `sqs-worker-fn` Lambda is triggered by both queues. It routes messages by a `type` field in the message body:

```typescript
export async function handler(event: SQSEvent) {
  for (const record of event.Records) {
    const message = JSON.parse(record.body) as SQSMessage;

    switch (message.type) {
      case 'LOCK_EXPIRY':
        await handleLockExpiry(message.payload);
        break;
      case 'SEND_EMAIL':
        await handleSendEmail(message.payload);
        break;
      default:
        console.error('Unknown message type', message.type);
    }
  }
}
```

### Email Queue Message Shape

```typescript
interface SendEmailMessage {
  type: 'SEND_EMAIL';
  payload: {
    template: EmailTemplate;
    to: string;
    data: Record<string, unknown>;
    attemptCount: number;
  };
}

type EmailTemplate =
  | 'booking_confirmation_driver'
  | 'booking_confirmation_host'
  | 'booking_cancellation_driver'
  | 'booking_cancellation_host'
  | 'payment_receipt_driver'
  | 'listing_approved_host'
  | 'listing_rejected_host';
```

### Email Retry Strategy

SES send failures are retried via SQS's built-in retry mechanism (up to 3 attempts before the message moves to the DLQ). The DLQ triggers a CloudWatch alarm for manual investigation.

```typescript
async function handleSendEmail(payload: SendEmailPayload) {
  try {
    await ses.sendTemplatedEmail({
      Source: 'noreply@alpacaparking.com',
      Destination: { ToAddresses: [payload.to] },
      Template: payload.template,
      TemplateData: JSON.stringify(payload.data),
    }).promise();
  } catch (err) {
    // Re-throw so SQS retries the message
    throw err;
  }
}
```

### Email Templates

SES email templates are pre-registered in AWS. Each template uses Handlebars-style `{{variable}}` substitution.

| Template | Trigger | Key Variables |
|---|---|---|
| `booking_confirmation_driver` | Booking confirmed | bookingId, spotAddress, startTime, endTime, totalPrice, entryInstructions, cancellationPolicy |
| `booking_confirmation_host` | Booking confirmed | bookingId, spotAddress, startTime, endTime, driverName, vehicleLicencePlate |
| `booking_cancellation_driver` | Booking cancelled | bookingId, spotAddress, startTime, endTime, refundStatus |
| `booking_cancellation_host` | Booking cancelled | bookingId, spotAddress, startTime, endTime |
| `payment_receipt_driver` | Payment succeeded | bookingId, amount, currency, stripePaymentRef |
| `listing_approved_host` | Listing approved | listingTitle, listingUrl |
| `listing_rejected_host` | Listing rejected | listingTitle, rejectionReason |


---

## S3 Photo Upload Flow

### Flow

```
Host (browser)              Backend Lambda              AWS S3
     │                           │                        │
     │  POST /photos/upload-url  │                        │
     │  { filename, contentType }│                        │
     │──────────────────────────►│                        │
     │                           │  generatePresignedUrl  │
     │                           │───────────────────────►│
     │                           │  { uploadUrl, key }    │
     │                           │◄───────────────────────│
     │  { uploadUrl, key }       │                        │
     │◄──────────────────────────│                        │
     │                           │                        │
     │  PUT uploadUrl (direct)   │                        │
     │──────────────────────────────────────────────────► │
     │  200 OK                   │                        │
     │◄────────────────────────────────────────────────── │
     │                           │                        │
     │  PUT /parking-spots/:id   │                        │
     │  { photos: [..., key] }   │                        │
     │──────────────────────────►│                        │
     │  200 OK                   │                        │
     │◄──────────────────────────│                        │
```

### Pre-Signed URL Generation

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function generateUploadUrl(
  spotId: string,
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; key: string }> {
  const ext = filename.split('.').pop();
  const key = `spots/${spotId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: process.env.PHOTOS_BUCKET,
    Key: key,
    ContentType: contentType,
    // Restrict to images only
    Metadata: { uploadedBy: 'alpaca-parking' },
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 min

  return { uploadUrl, key };
}
```

### S3 Bucket Configuration

- **Bucket**: `alpaca-parking-photos-{env}`
- **Access**: Private (no public access). Photos are served via CloudFront with a signed URL or OAC (Origin Access Control).
- **CORS**: Allows `PUT` from the frontend domain for direct uploads.
- **Lifecycle**: No expiry for MVP; photos are retained indefinitely.
- **Content-Type restriction**: The pre-signed URL is scoped to the specific `ContentType` provided. The frontend validates file type before requesting the URL.

### Photo URL Resolution

The `photos` column stores S3 object keys (not full URLs). The backend resolves keys to CloudFront URLs when returning spot data:

```typescript
function resolvePhotoUrl(key: string): string {
  return `https://${process.env.CLOUDFRONT_DOMAIN}/${key}`;
}
```


---

## Map and Geocoding Integration

### Provider: Google Maps Platform

**Rationale**: Google Maps provides superior POI data for Canadian cities (Toronto, Vancouver), which is critical for the "Where" autocomplete input. The Places API and Maps JavaScript API share the same billing account and API key, simplifying setup.

### Frontend Map Integration

The frontend uses `@vis.gl/react-google-maps` (the official React wrapper for the Google Maps JS API):

```typescript
// app/layout.tsx
import { APIProvider } from '@vis.gl/react-google-maps';

export default function RootLayout({ children }) {
  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}>
      {children}
    </APIProvider>
  );
}
```

### Address Autocomplete (WhereInput)

```typescript
// components/search/WhereInput.tsx
import { usePlacesAutocomplete } from '@vis.gl/react-google-maps';

export function WhereInput({ onSelect }) {
  const { suggestions, setValue, clearSuggestions } = usePlacesAutocomplete({
    requestOptions: {
      componentRestrictions: { country: 'ca' }, // Canada only for MVP
      types: ['geocode', 'establishment'],
    },
  });

  const handleSelect = async (description: string) => {
    const geocoder = new google.maps.Geocoder();
    const result = await geocoder.geocode({ address: description });
    const { lat, lng } = result.results[0].geometry.location;
    onSelect({ address: description, lat: lat(), lng: lng() });
    clearSuggestions();
  };

  // Render autocomplete dropdown...
}
```

### Map View with Price Pins

```typescript
// components/search/MapView.tsx
import { Map, AdvancedMarker } from '@vis.gl/react-google-maps';

export function MapView({ spots, hoveredSpotId, onSpotHover }) {
  return (
    <Map
      defaultCenter={{ lat: 43.6532, lng: -79.3832 }} // Toronto default
      defaultZoom={14}
      mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID}
    >
      {spots.map(spot => (
        <AdvancedMarker
          key={spot.id}
          position={{ lat: spot.latitude, lng: spot.longitude }}
          onClick={() => onSpotHover(spot.id)}
        >
          <SpotPin
            price={spot.pricePerHour}
            isActive={hoveredSpotId === spot.id}
          />
        </AdvancedMarker>
      ))}
    </Map>
  );
}

// SpotPin renders a pill-shaped label: "$8/hr"
function SpotPin({ price, isActive }) {
  return (
    <div className={`spot-pin ${isActive ? 'spot-pin--active' : ''}`}>
      ${(price / 100).toFixed(0)}/hr
    </div>
  );
}
```

### Backend Geocoding

The backend does **not** geocode addresses. Geocoding happens client-side via the Google Places Autocomplete widget, which returns `lat/lng` directly. The search API accepts `lat`, `lng`, and `radiusKm` as query parameters.

If a client submits an address string instead of coordinates (e.g., a future mobile app), the backend can geocode using the Google Geocoding API:

```typescript
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number }> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_SERVER_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK') throw new AppError('GEOCODING_FAILED', 422);
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng };
}
```

### Distance Calculation

Distance is calculated in PostgreSQL using PostGIS `ST_Distance` with the `geography` type (which uses the WGS 84 ellipsoid for accurate metre-level distances):

```sql
ST_Distance(
  ps.location::geography,
  ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography
) AS distance_meters
```

The `ST_DWithin` function uses the spatial index on `location` for efficient radius filtering before computing exact distances.

### API Key Security

- `NEXT_PUBLIC_GOOGLE_MAPS_KEY` — restricted to HTTP referrers (the frontend domain) and the Maps JS API + Places API
- `GOOGLE_MAPS_SERVER_KEY` — restricted to server IP ranges and the Geocoding API only; never exposed to the client


---

## Shared TypeScript Types Strategy

### Monorepo Structure

The project uses a monorepo (npm workspaces or Turborepo) to share types between the frontend and backend:

```
alpaca-parking/
├── packages/
│   └── types/                    # @alpaca/types
│       ├── src/
│       │   ├── index.ts          # Re-exports all types
│       │   ├── domain.ts         # Core domain types (User, Booking, etc.)
│       │   ├── api.ts            # Request/response shapes
│       │   └── errors.ts         # Error codes enum + ErrorResponse
│       ├── package.json
│       └── tsconfig.json
├── apps/
│   ├── web/                      # Next.js frontend
│   │   └── package.json          # "dependencies": { "@alpaca/types": "*" }
│   └── api/                      # Lambda functions
│       └── package.json          # "dependencies": { "@alpaca/types": "*" }
└── package.json                  # workspaces: ["packages/*", "apps/*"]
```

### Error Codes Enum

```typescript
// packages/types/src/errors.ts
export enum ErrorCode {
  // Auth
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  UNAUTHORIZED = 'UNAUTHORIZED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  ACCOUNT_BANNED = 'ACCOUNT_BANNED',
  ACCOUNT_TEMPORARILY_LOCKED = 'ACCOUNT_TEMPORARILY_LOCKED',
  INVALID_OTP = 'INVALID_OTP',

  // Vehicles
  VEHICLE_REQUIRED = 'VEHICLE_REQUIRED',
  VEHICLE_IN_USE = 'VEHICLE_IN_USE',

  // Listings
  LISTING_NOT_EDITABLE = 'LISTING_NOT_EDITABLE',
  BLOCK_CONFLICTS_WITH_BOOKING = 'BLOCK_CONFLICTS_WITH_BOOKING',

  // Bookings
  BOOKING_CONFLICT = 'BOOKING_CONFLICT',
  BOOKING_NOT_CANCELLABLE = 'BOOKING_NOT_CANCELLABLE',
  SPOT_LOCKED = 'SPOT_LOCKED',
  TOO_MANY_ACTIVE_LOCKS = 'TOO_MANY_ACTIVE_LOCKS',

  // Search
  RADIUS_TOO_LARGE = 'RADIUS_TOO_LARGE',
  INVALID_TIME_RANGE = 'INVALID_TIME_RANGE',
  GEOCODING_FAILED = 'GEOCODING_FAILED',

  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}
```

### Type Safety at API Boundaries

The frontend uses typed fetch wrappers that reference the shared types:

```typescript
// apps/web/src/lib/api.ts
import type { SearchParkingRequest, SearchParkingResponse } from '@alpaca/types';

export async function searchParking(
  params: SearchParkingRequest
): Promise<SearchParkingResponse> {
  const query = new URLSearchParams({
    lat: String(params.latitude),
    lng: String(params.longitude),
    radiusKm: String(params.radiusKm),
    startTime: params.startTime,
    endTime: params.endTime,
  });
  const res = await fetch(`/api/v1/parking-spots/search?${query}`);
  if (!res.ok) throw await res.json();
  return res.json();
}
```

Lambda handlers use the same types for request validation and response serialisation, ensuring the contract is enforced at compile time on both sides.


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

Before writing the final properties, redundant candidates are eliminated:

- **4.9 (no overlapping confirmed bookings in search) and 10.2 (booking conflict prevention)** both test the same underlying invariant — that confirmed bookings don't overlap. They can be unified into one property: "no two confirmed bookings for the same spot overlap in time."
- **9.2 (lock blocks overlapping bookings) and 10.2 (booking conflict)** are distinct: one tests the lock mechanism, the other tests the booking exclusion constraint. Both are kept.
- **18.4 (double-booking prevention)** is fully subsumed by the booking conflict property. Removed.
- **4.8 (only active spots in search) and 4.1 (search returns spots within radius and available)** can be combined into one comprehensive search correctness property.
- **16.4 (Haversine distance properties)** — symmetry and non-negativity are combined into one property.

---

### Property 1: Search results satisfy all filter constraints

*For any* valid search request (destination coordinates, radius ≤ 50 km, valid time window), every spot returned in the results must: (a) have status `active`, (b) be located within the specified radius of the destination, (c) not have a confirmed booking overlapping the requested time window, and (d) not have an availability block covering any part of the requested time window.

**Validates: Requirements 4.1, 4.8, 4.9, 4.10**

---

### Property 2: Search results are sorted by distance ascending

*For any* search response containing two or more results, the `distanceMeters` values must be non-decreasing — that is, for all indices `i`, `results[i].distanceMeters <= results[i+1].distanceMeters`.

**Validates: Requirements 4.3**

---

### Property 3: Search rejects invalid radius

*For any* search request where `radiusKm > 50`, the system must return HTTP 422 with error code `RADIUS_TOO_LARGE`.

**Validates: Requirements 4.6**

---

### Property 4: Search rejects invalid time range

*For any* search request where `endTime <= startTime`, the system must return HTTP 422 with error code `INVALID_TIME_RANGE`.

**Validates: Requirements 4.7**

---

### Property 5: New listings always start as draft

*For any* valid listing creation request submitted by a host, the returned `ParkingSpot` must have `status = 'draft'`.

**Validates: Requirements 6.3**

---

### Property 6: Non-editable listing statuses are enforced

*For any* listing with status `pending_review` or `active`, any PUT request to update that listing must return HTTP 422 with error code `LISTING_NOT_EDITABLE`.

**Validates: Requirements 6.7**

---

### Property 7: Availability block conflicts with confirmed bookings are rejected

*For any* availability block creation request where the block's `[startTime, endTime)` interval overlaps with an existing confirmed booking's `[startTime, endTime)` interval for the same parking spot, the system must return HTTP 422 with error code `BLOCK_CONFLICTS_WITH_BOOKING`.

**Validates: Requirements 7.6**

---

### Property 8: Checkout lock duration is always exactly 10 minutes

*For any* successfully created `CheckoutLock`, the `expiresAt` timestamp must equal `createdAt + 600 seconds` (within a 1-second tolerance for processing time).

**Validates: Requirements 9.1**

---

### Property 9: Active checkout lock blocks overlapping reservations

*For any* active `CheckoutLock` held by driver A for a given spot and time window, any attempt by a different driver B to create a `Booking` or `CheckoutLock` for an overlapping time window on the same spot must return HTTP 409 with error code `SPOT_LOCKED`.

**Validates: Requirements 9.2**

---

### Property 10: Confirmed bookings never overlap

*For any* two confirmed bookings on the same parking spot, their time windows must not overlap — that is, one booking's `endTime` must be ≤ the other booking's `startTime`.

**Validates: Requirements 10.2, 18.4**

---

### Property 11: Total price calculation is correct

*For any* booking with a given `pricePerHour` (in cents), `startTime`, and `endTime`, the `totalPrice` must equal `round(pricePerHour × durationHours)` where `durationHours = (endTime - startTime) / 3600000` and rounding is to the nearest integer cent.

**Validates: Requirements 10.6**

---

### Property 12: Webhook signature verification rejects invalid requests

*For any* POST request to `/api/v1/payments/webhook` that is missing the `Stripe-Signature` header or contains an invalid signature, the system must reject the request without processing the event payload.

**Validates: Requirements 11.8**

---

### Property 13: Cancellation policy is applied correctly based on timing

*For any* booking cancellation where the cancellation occurs more than 1 hour before `startTime`, a full refund must be initiated and the `Payment` status must be set to `refunded`. *For any* booking cancellation where the cancellation occurs 1 hour or less before `startTime`, no refund must be initiated and the `Payment` status must remain `succeeded`.

**Validates: Requirements 12.1, 12.2, 12.3**

---

### Property 14: Lock hoarding limit is enforced

*For any* driver who already has 3 or more active (non-expired) `CheckoutLock` records, any attempt to create an additional `CheckoutLock` must return HTTP 422 with error code `TOO_MANY_ACTIVE_LOCKS`.

**Validates: Requirements 15.6**

---

### Property 15: Distance calculation is symmetric and non-negative

*For any* two coordinate pairs (lat1, lng1) and (lat2, lng2), the Haversine distance function must satisfy: (a) `distance(A, B) = distance(B, A)` (symmetry), (b) `distance(A, A) = 0` (identity), and (c) `distance(A, B) >= 0` for all inputs (non-negativity).

**Validates: Requirements 16.4**

---

### Property 16: Invalid credentials always return 401

*For any* login attempt with an (email, password) pair that does not match a registered user's credentials, the system must return HTTP 401 with error code `INVALID_CREDENTIALS`.

**Validates: Requirements 1.5**

---

### Property 17: Every registered user has exactly one valid role

*For any* user record in the system, the `role` field must be exactly one value from the set `{ "driver", "host", "admin" }`.

**Validates: Requirements 1.6**


---

## Error Handling

### Error Response Format

All errors follow the `ErrorResponse` shape defined in `@alpaca/types`:

```typescript
{
  "error": {
    "code": "BOOKING_CONFLICT",
    "message": "A confirmed booking already exists for this spot and time window.",
    "details": {
      "conflictingBookingId": "b_abc123",
      "conflictStart": "2024-07-15T18:00:00Z",
      "conflictEnd": "2024-07-15T21:00:00Z"
    }
  }
}
```

### Error Handling Strategy

**Application errors** (business rule violations, validation failures) are thrown as typed `AppError` instances:

```typescript
class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly httpStatus: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(code);
  }
}
```

**Lambda error handler middleware** catches all errors and serialises them:

```typescript
function errorHandler(err: unknown, req: Request): APIGatewayProxyResult {
  if (err instanceof AppError) {
    return {
      statusCode: err.httpStatus,
      body: JSON.stringify({
        error: { code: err.code, message: err.message, details: err.details }
      }),
    };
  }

  // Unexpected errors — log and return 500
  console.error('Unhandled error', err);
  return {
    statusCode: 500,
    body: JSON.stringify({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' }
    }),
  };
}
```

### Database Error Handling

PostgreSQL constraint violations are mapped to application errors:

| PG Error Code | Constraint | AppError |
|---|---|---|
| `23P01` (exclusion violation) | `bookings_no_overlap` | `BOOKING_CONFLICT` (409) |
| `23P01` (exclusion violation) | `checkout_locks_no_overlap` | `SPOT_LOCKED` (409) |
| `23505` (unique violation) | `payments.provider_payment_intent_id` | `INTERNAL_ERROR` (500) — idempotency issue |
| `23503` (foreign key violation) | any | `NOT_FOUND` (404) |

### Stripe Error Handling

Stripe API errors are caught and mapped:

```typescript
try {
  const paymentIntent = await stripe.paymentIntents.create(...);
} catch (err) {
  if (err instanceof Stripe.errors.StripeCardError) {
    throw new AppError('PAYMENT_CARD_DECLINED', 422, { stripeCode: err.code });
  }
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    throw new AppError('PAYMENT_INVALID_REQUEST', 422);
  }
  throw err; // Re-throw unexpected Stripe errors
}
```

### Idempotency

The Stripe PaymentIntent creation endpoint uses the `bookingId` as the idempotency key to prevent duplicate charges if the client retries:

```typescript
const paymentIntent = await stripe.paymentIntents.create(
  { amount, currency, metadata },
  { idempotencyKey: `booking_${bookingId}` }
);
```


---

## Testing Strategy

### Dual Testing Approach

The MVP uses a combination of property-based tests and example-based unit/integration tests.

**Property-based tests** verify universal correctness properties (see Correctness Properties section) across many generated inputs. These catch edge cases that example tests miss.

**Example-based unit tests** verify specific behaviors, error conditions, and integration points with concrete inputs.

**Integration tests** verify end-to-end flows against a real (test) database and mocked external services (Stripe, SES, Google Maps).

### Property-Based Testing Library

**Library**: `fast-check` (TypeScript-native, excellent arbitrary generators)

**Configuration**: Minimum 100 runs per property test.

```typescript
// Example property test
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

describe('Search results are sorted by distance', () => {
  it('Property 2: distances are non-decreasing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          lat: fc.float({ min: 43.0, max: 44.0 }),
          lng: fc.float({ min: -80.0, max: -79.0 }),
          radiusKm: fc.float({ min: 0.1, max: 10 }),
          startTime: fc.date({ min: new Date('2024-01-01') }),
          durationHours: fc.integer({ min: 1, max: 8 }),
        }),
        async ({ lat, lng, radiusKm, startTime, durationHours }) => {
          const endTime = new Date(startTime.getTime() + durationHours * 3600000);
          const results = await searchParking({ lat, lng, radiusKm, startTime, endTime });

          for (let i = 0; i < results.spots.length - 1; i++) {
            expect(results.spots[i].distanceMeters)
              .toBeLessThanOrEqual(results.spots[i + 1].distanceMeters);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

Each property test is tagged with a comment referencing the design property:
```
// Feature: parking-app-mvp, Property 2: Search results are sorted by distance ascending
```

### Test Organisation

```
apps/api/
├── src/
│   └── ...
└── tests/
    ├── unit/
    │   ├── services/
    │   │   ├── booking.service.test.ts      # Unit tests for BookingService
    │   │   ├── availability.service.test.ts
    │   │   └── payment.service.test.ts
    │   └── utils/
    │       └── haversine.test.ts
    ├── property/
    │   ├── search.property.test.ts          # Properties 1-4
    │   ├── booking.property.test.ts         # Properties 9-11, 14
    │   ├── listing.property.test.ts         # Properties 5-7
    │   ├── payment.property.test.ts         # Properties 12-13
    │   ├── auth.property.test.ts            # Properties 16-17
    │   └── distance.property.test.ts        # Property 15
    └── integration/
        ├── search.integration.test.ts
        ├── booking.integration.test.ts
        ├── payment.integration.test.ts
        └── webhook.integration.test.ts
```

### Unit Test Focus Areas

Unit tests cover:
- `calculateTotalPrice(pricePerHour, startTime, endTime)` — price calculation edge cases (fractional hours, rounding)
- `isRefundEligible(cancellationTime, bookingStartTime)` — cancellation policy boundary (exactly 1 hour before)
- `haversineDistance(lat1, lng1, lat2, lng2)` — known coordinate pairs
- `validateSearchParams(params)` — input validation logic
- JWT middleware — valid token, expired token, wrong issuer, missing header
- Stripe webhook signature verification — valid signature, tampered payload

### Integration Test Focus Areas

Integration tests run against a test PostgreSQL database (Docker) with mocked Stripe and SES:
- Full booking flow: create booking → checkout lock → payment intent → webhook → confirmed
- Cancellation with refund: confirmed booking → cancel > 1hr before → refund issued
- Cancellation without refund: confirmed booking → cancel ≤ 1hr before → no refund
- Double-booking prevention: two concurrent booking attempts for the same slot
- Lock expiry: create lock → advance time → verify lock expired and booking status = 'expired'
- Admin listing approval: pending listing → approve → status = 'active', email enqueued
- Search exclusion: spot with confirmed booking → search for overlapping window → spot excluded

### Frontend Testing

The Next.js frontend uses:
- **Vitest + React Testing Library** for component unit tests
- **Playwright** for end-to-end tests covering the critical user flows:
  - Search → select spot → book → pay (happy path)
  - Host listing creation wizard
  - Admin approve/reject listing

### Test Infrastructure

- **Local**: Docker Compose with PostgreSQL + PostGIS, LocalStack for SQS/SES/S3
- **CI**: GitHub Actions running unit + property tests on every PR; integration tests on merge to main
- **Test database**: Separate RDS instance in the `test` environment; migrations run before each test suite

