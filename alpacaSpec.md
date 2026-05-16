# Parking App MVP Product Spec

## 1. Product Vision

Build a simple, reliable parking marketplace that allows drivers to find, reserve, and pay for parking near their destination, while allowing hosts to list unused parking spaces in residential or commercial areas.

The MVP should focus on making the core parking transaction fast, trustworthy, and easy:

```text
Search -> Select Spot -> Book -> Pay -> Confirm
```

The long-term vision is to become a destination-aware parking marketplace that helps users find parking not just by address, but by venue, event, and intent.

---

## 2. MVP Goals

The MVP should validate whether users are willing to search for, reserve, and pay for parking through the app.

### Primary Goals

- Validate demand for pre-bookable parking in one launch city, such as Toronto or Vancouver.
- Allow users to find parking near a destination address within a customizable radius.
- Allow users to complete a booking in under 60 seconds.
- Support private parking spots from residential hosts.
- Support commercial or manually seeded parking supply.
- Prevent double bookings.
- Process payment securely before confirming the booking.

### MVP Success Criteria

The MVP is successful if:

- Users can search for parking by destination.
- Users can see available parking spots within a selected radius.
- Users can book and pay for a spot.
- Hosts can list a parking spot.
- Admin can review and approve listings.
- Bookings are recorded accurately.
- Hosts and drivers receive booking confirmation.

---

## 3. Target Users

## 3.1 Drivers

Drivers are people looking for short-term or scheduled parking near a destination.

Examples:

- Commuters
- Event-goers
- Delivery drivers
- Tourists
- Travellers
- People going downtown for appointments, restaurants, nightlife, or errands

## 3.2 Hosts

Hosts are people or businesses with unused parking spaces that can be rented out.

Examples:

- Homeowners with unused driveways
- Condo owners with spare parking spaces
- Small lot operators
- Businesses with unused parking during certain hours

## 3.3 Admins

Admins manage marketplace trust, quality, and operations.

Examples:

- Approving host listings
- Reviewing suspicious listings
- Handling disputes
- Managing refunds
- Managing canonical venue records in future versions

---

# 4. MVP Feature Set

## 4.1 Search and Discovery

### Feature Summary

Drivers should be able to search for parking near a destination address or their current location.

### User Requirements

A driver should be able to:

- Enter a destination address.
- Use current GPS location.
- Select a parking date.
- Select a start time.
- Select a duration.
- Set a search radius in kilometers.
- View nearby parking spots on a map.
- View nearby parking spots in a list.
- See spot price, distance, and availability.
- Filter by price, distance, and spot type.

### Radius-Based Search

Users should be able to enter a destination address and see parking spots within `x` kilometers of the destination.

The value of `x` should be customizable.

Example:

```text
Destination: Rogers Centre
Radius: 1.5 km
Time: Today, 6:00 PM to 10:00 PM
Result: Available parking spots within 1.5 km of Rogers Centre
```

### MVP Filters

The MVP should support basic filters:

- Price
- Distance
- Spot type

Spot types:

- Driveway
- Garage
- Lot
- Underground
- Other

### Out of Scope for MVP

The following are not required for the first launch:

- AI recommendations
- Alerts for freed-up parking
- Complex filters
- Saved searches
- Predictive availability
- Dynamic pricing

---

## 4.2 Parking Spot Details

### Feature Summary

Drivers should be able to view enough information about a parking spot to trust it and decide whether to book it.

### Required Spot Details

Each parking spot detail page should show:

- Spot title or label
- Address or approximate location
- Map location
- Price
- Availability window
- Distance from destination
- Spot type
- Photos
- Host information
- Parking rules
- Cancellation policy

### Parking Rules

The listing should include rules such as:

- Covered or uncovered
- Overnight parking allowed or not
- Maximum vehicle size
- Height restriction, if any
- EV charging availability, if any
- Whether blocking other vehicles is possible
- Entry instructions
- Exit instructions

### Trust Signals

To improve trust, the MVP should support:

- Verified listing status
- Photos required for host-created listings
- Host phone verification
- Manual admin approval before a listing goes live

### Out of Scope for MVP

- Host ratings
- Driver ratings
- Automated image verification
- Live camera verification

---

## 4.3 Booking System

### Feature Summary

Drivers should be able to reserve a parking spot for a specific time window.

### User Requirements

A driver should be able to:

- Select a start time.
- Select an end time or duration.
- See total price before payment.
- Reserve a spot.
- Receive booking confirmation.
- View upcoming bookings.
- Cancel a booking, subject to cancellation rules.

### Booking Conflict Prevention

The system must prevent double booking.

A parking spot cannot have overlapping confirmed bookings.

Example:

```text
Existing booking: 6:00 PM to 9:00 PM
New requested booking: 8:00 PM to 10:00 PM
Result: Reject because the time window overlaps.
```

### Checkout Lock

During checkout, the system should temporarily lock the selected time window.

Recommended lock duration:

```text
2 to 5 minutes
```

If the user does not complete payment before the lock expires, the spot becomes available again.

### Booking Statuses

The system should support the following booking statuses:

```ts
type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "expired"
  | "payment_failed";
```

### MVP Booking Rule

For MVP, payment should be collected immediately before booking confirmation.

---

## 4.4 Payments

### Feature Summary

Drivers should pay in advance to confirm a booking.

### Payment Provider

Use Stripe for MVP payment processing.

### Required Payment Features

The MVP should support:

- Credit card payments
- Debit card payments
- Pre-payment before booking confirmation
- Payment success handling
- Payment failure handling
- Booking receipt
- Basic refund handling

### Recommended MVP Payment Flow

```text
User selects spot
-> App creates pending booking
-> App creates Stripe payment intent
-> User completes payment
-> Payment succeeds
-> Booking becomes confirmed
-> Confirmation email is sent
```

### Host Payouts

For MVP, host payouts can be manual or delayed while the marketplace is being validated.

The system should still store enough data to support future automated payouts.

### Out of Scope for MVP

- Apple Pay
- Google Pay
- Wallet credits
- Promo codes
- Automated host payouts
- Dynamic host commissions

---

## 4.5 User Accounts

### Feature Summary

Users need accounts to book parking, manage listings, and receive confirmations.

### Driver Account Requirements

Drivers should be able to:

- Sign up
- Log in
- Log out
- View profile
- View booking history
- View upcoming bookings

### Host Account Requirements

Hosts should be able to:

- Create an account
- Verify email
- Verify phone number
- Create parking listings
- View bookings for their spot

### Authentication Options

MVP can use one of:

- Email and password
- Google OAuth
- Cognito
- Firebase Auth

### Required User Fields

```ts
type User = {
  id: string;
  email: string;
  name: string;
  phoneNumber?: string;
  role: "driver" | "host" | "admin";
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
};
```

---

## 4.6 Booking Management

### Feature Summary

Drivers and hosts should be able to manage bookings.

### Driver Requirements

Drivers should be able to:

- View upcoming bookings
- View past bookings
- Cancel eligible bookings
- View booking details
- View receipt
- Access entry instructions

### Host Requirements

Hosts should be able to:

- View bookings for their spot
- See upcoming reservations
- See booking status
- Contact support if there is an issue

### Booking Detail Page Should Include

- Booking ID
- Spot address
- Date
- Start time
- End time
- Total price
- Booking status
- Entry instructions
- Host rules
- Cancellation policy

---

## 4.7 Notifications

### Feature Summary

The system should notify users about important booking events.

### MVP Notifications

Use email notifications for MVP.

Required emails:

- Booking confirmation to driver
- Booking confirmation to host
- Booking cancellation to driver
- Booking cancellation to host
- Payment receipt to driver

### Out of Scope for MVP

- SMS notifications
- Push notifications
- WhatsApp notifications
- Real-time notification center

---

## 4.8 Host Listing Flow

### Feature Summary

Hosts should be able to list unused parking spaces.

This is important for differentiation because the app should not only depend on commercial lots. Private residential supply can help the product become more like an Airbnb-style parking marketplace.

### Host Listing Requirements

A host should be able to create a listing with:

- Address
- Parking spot type
- Photos
- Availability
- Price
- Rules
- Entry instructions
- Vehicle restrictions

### Listing Approval

For MVP, every host-created listing should require manual admin approval before becoming visible to drivers.

### Listing Statuses

```ts
type ParkingSpotStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "paused"
  | "rejected";
```

### MVP Host Flow

```text
Host creates listing
-> Host submits listing for review
-> Admin reviews listing
-> Admin approves listing
-> Spot becomes searchable
```

### Required Listing Fields

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
  photos: string[];
  rules: string[];
  entryInstructions: string;
  maxVehicleSize?: string;
  heightRestrictionCm?: number;
  isCovered: boolean;
  allowOvernight: boolean;
  status: ParkingSpotStatus;
  createdAt: string;
  updatedAt: string;
};
```

---

## 4.9 Admin Listing Review

### Feature Summary

Admins should be able to review and approve listings before they appear in search results.

### Admin Requirements

Admins should be able to:

- View pending listings
- Open listing details
- Approve listings
- Reject listings
- Pause active listings
- Add rejection reason
- Remove fraudulent or unsafe listings

### Acceptance Criteria

- A host listing is not searchable until approved.
- Admin can approve a listing.
- Admin can reject a listing with a reason.
- Rejected listings are not visible to drivers.
- Paused listings are not visible to drivers.

---

# 5. Availability Model

## 5.1 Feature Summary

Availability is one of the most important parts of the product. The MVP should keep availability simple but accurate.

## 5.2 MVP Availability Rules

The MVP should support recurring weekly availability.

Example:

```text
Monday to Friday: 8:00 AM to 6:00 PM
Saturday: 10:00 AM to 11:00 PM
Sunday: unavailable
```

The MVP should also support blocked dates or blocked time windows.

Example:

```text
Spot normally available Monday to Friday.
Host blocks July 12 because they need the driveway.
```

## 5.3 Data Model

```ts
type AvailabilityRule = {
  id: string;
  parkingSpotId: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  timezone: string;
};

type AvailabilityBlock = {
  id: string;
  parkingSpotId: string;
  startTime: string;
  endTime: string;
  reason?: string;
};
```

## 5.4 Out of Scope for MVP

- Calendar sync
- Complex seasonal schedules
- Dynamic availability from sensors
- Real-time garage integrations

---

# 6. Maps and Location

## 6.1 Feature Summary

The app depends heavily on maps, geocoding, and distance calculations.

## 6.2 Required Capabilities

The MVP should support:

- Address autocomplete
- Address geocoding
- Reverse geocoding if needed
- Map display
- Distance calculation from destination to parking spot
- Radius-based filtering

## 6.3 Recommended Services

Recommended options:

- Google Places API for address autocomplete
- Google Maps API or Mapbox for map rendering
- PostGIS if using PostgreSQL
- DynamoDB geospatial indexing if using DynamoDB

## 6.4 Distance Calculation

For MVP, straight-line distance is acceptable.

Post-MVP, walking distance should be added because users care more about walk time than raw distance.

---

# 7. Backend Architecture

## 7.1 API Technology Decision

The MVP backend should use REST APIs built with Node.js and TypeScript, deployed on AWS Lambda behind API Gateway HTTP API.

The goal is to keep infrastructure cost low while maintaining a backend architecture that can scale as usage grows.

Recommended MVP backend:

```text
React / Next.js frontend
API Gateway HTTP API
AWS Lambda
Node.js + TypeScript
PostgreSQL + PostGIS
Stripe
S3 for listing photos
SES for transactional emails
```

## 7.2 Why REST for MVP

REST is preferred for the MVP because the core product actions are simple and business-oriented:

- Search parking
- Get parking spot details
- Create parking listing
- Create booking
- Create payment intent
- Cancel booking
- Approve or reject listing

REST is also:

- Simple to build
- Easy to debug
- Easy for web and mobile clients to consume
- Easy to document with OpenAPI
- Easier for AI coding assistants to generate from a spec

GraphQL or AWS AppSync can be considered later if the product needs more flexible client-driven querying, real-time subscriptions, or more complex nested data loading.

## 7.3 AWS Services

### API Layer

Use:

```text
API Gateway HTTP API -> AWS Lambda
```

API Gateway HTTP API is preferred over API Gateway REST API for MVP because it is simpler and generally cheaper for common HTTP workloads.

### Compute

Use AWS Lambda with Node.js and TypeScript.

Lambda is a good fit for MVP because:

- It has low idle cost.
- It scales automatically.
- It avoids managing servers.
- It works well for request/response API workloads.
- It supports small focused functions for search, bookings, payments, listings, and admin actions.

Where possible, use the ARM64 Lambda architecture to reduce compute cost.

### Database

Use PostgreSQL with PostGIS as the primary database.

PostGIS is recommended because the product depends heavily on location-based queries, such as:

```text
Find all active parking spots within 1.5 km of this destination
that are available between 6 PM and 10 PM
sorted by distance or price.
```

DynamoDB can work for some marketplace products, but it makes geospatial search, relational data, and booking overlap checks more complex.

Recommended database options:

- Amazon RDS PostgreSQL for predictable early usage
- Aurora Serverless PostgreSQL if serverless scaling is desired later

### Images

Use S3 for parking spot photos.

Do not store images in the database.

Recommended image upload flow:

```text
Client requests upload URL
-> Backend creates pre-signed S3 URL
-> Client uploads image directly to S3
-> Client sends uploaded image URL/key to backend
-> Backend saves image reference on listing
```

This keeps API costs lower and works well for both web and mobile clients.

### Emails

Use Amazon SES for transactional emails.

Required email use cases:

- Booking confirmation
- Booking cancellation
- Payment receipt
- Host listing approval
- Host listing rejection

### Background Jobs

Use SQS and EventBridge when needed.

Potential background jobs:

- Expire pending bookings when checkout lock times out
- Send reminder emails
- Process delayed host payout workflows
- Retry failed email sends

## 7.4 Cost-Saving Principles

The MVP should avoid unnecessary always-on infrastructure.

Recommended principles:

- Use Lambda for request-based compute.
- Use API Gateway HTTP API instead of REST API unless REST API-only features are needed.
- Use S3 for files and images.
- Use SES for low-cost transactional emails.
- Avoid NAT Gateway early if possible because it can become expensive.
- Keep Lambda functions small and focused.
- Avoid overbuilding microservices before product-market fit.
- Monitor database costs carefully.
- Use connection pooling or RDS Proxy if Lambda database connections become a problem.

## 7.5 Shared Backend Strategy

The backend should be designed as one shared API platform that can serve:

```text
React web app
Future mobile app
Admin dashboard
Future partner APIs
```

The backend should expose business capabilities rather than UI-specific endpoints.

Good endpoint design:

```text
GET  /api/v1/parking-spots/search
GET  /api/v1/parking-spots/:id
POST /api/v1/bookings
POST /api/v1/payments/create-intent
GET  /api/v1/users/me/bookings
```

Avoid endpoints that are tied to a specific screen or client:

```text
GET  /api/v1/web/homepage-parking-list
POST /api/v1/mobile/search-screen-submit
```

The same core API should work for the React web app and the future mobile app.

## 7.6 API Versioning

All API endpoints should be versioned from the start.

Use:

```text
/api/v1
```

Examples:

```text
GET  /api/v1/parking-spots/search
POST /api/v1/bookings
POST /api/v1/payments/create-intent
```

This is important because mobile apps are harder to update than web apps. A user may keep an old mobile app version installed for months.

Future breaking changes should use a new API version, such as:

```text
/api/v2
```

## 7.7 Authentication Strategy

Authentication should work for both web and mobile clients.

Recommended options:

- AWS Cognito for AWS-native authentication
- Clerk for faster developer experience
- Firebase Auth for fast MVP development
- Auth0 for more advanced identity needs

The backend should validate JWT access tokens sent by clients.

Example request:

```http
GET /api/v1/bookings/me
Authorization: Bearer <access_token>
```

The backend should identify the user from the token and enforce authorization rules.

Do not rely on frontend UI checks for security.

## 7.8 Role-Based Access Control

The backend should enforce roles.

Supported roles:

```ts
type UserRole = "driver" | "host" | "admin";
```

Examples:

- Drivers can create bookings.
- Hosts can create and manage their own listings.
- Admins can approve listings and manage unsafe content.

Admin APIs must be protected on the backend.

## 7.9 Admin API Separation

Admin APIs should use the same backend but be clearly separated.

Examples:

```text
GET  /api/v1/admin/listings/pending
POST /api/v1/admin/listings/:id/approve
POST /api/v1/admin/listings/:id/reject
GET  /api/v1/admin/bookings
```

Admin routes must verify that the authenticated user has the `admin` role.

## 7.10 Stable API Response Shapes

API responses should remain stable because the backend will eventually support mobile clients.

Adding new response fields is acceptable.

Example safe change:

```json
{
  "id": "spot_123",
  "title": "Driveway near Rogers Centre",
  "pricePerHour": 8,
  "distanceMeters": 450,
  "walkingTimeMinutes": 7,
  "type": "driveway",
  "isAvailable": true
}
```

Removing or renaming fields should be avoided because it can break older mobile clients.

## 7.11 Shared TypeScript Types

Because the frontend and backend will use TypeScript, request and response types should be shared where practical.

Example:

```ts
export type SearchParkingRequest = {
  latitude: number;
  longitude: number;
  radiusKm: number;
  startTime: string;
  endTime: string;
};

export type SearchParkingResponse = {
  spots: ParkingSearchResult[];
};

export type ParkingSearchResult = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  pricePerHour: number;
  distanceMeters: number;
  type: "driveway" | "garage" | "lot" | "underground" | "other";
  isAvailable: boolean;
};
```

This helps keep the React web app, future mobile app, and backend aligned.

## 7.12 OpenAPI Documentation

The REST API should be documented with OpenAPI.

OpenAPI is useful for:

- Frontend development
- Future mobile development
- AI coding assistant implementation
- API testing
- Future partner integrations
- Developer documentation

The OpenAPI spec should include:

- Endpoint paths
- Request parameters
- Request bodies
- Response bodies
- Error responses
- Authentication requirements

## 7.13 Client Strategy

The first clients are expected to be:

1. React / Next.js web app
2. Admin dashboard
3. Future mobile app, likely React Native

The backend should not make assumptions that only work for web browsers.

For example:

- Use bearer token authentication, not browser-session-only authentication.
- Use API responses that work for both web and mobile.
- Use S3 pre-signed uploads for images so both web and mobile can upload photos directly.
- Keep business logic in the backend, not in the frontend.

## 7.14 When to Consider GraphQL Later

GraphQL or AWS AppSync may be considered later if:

- Web and mobile clients need highly flexible queries.
- The app needs real-time subscriptions.
- Venue pages, bookings, users, and recommendations become heavily nested.
- Multiple client teams need a more flexible API contract.

For MVP, REST is preferred because it is simpler, cheaper to reason about, and easier to launch quickly.

---

# 8. Core Data Model

## 8.1 User

```ts
type User = {
  id: string;
  email: string;
  name: string;
  phoneNumber?: string;
  role: "driver" | "host" | "admin";
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
};
```

## 8.2 ParkingSpot

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
  photos: string[];
  rules: string[];
  entryInstructions: string;
  maxVehicleSize?: string;
  heightRestrictionCm?: number;
  isCovered: boolean;
  allowOvernight: boolean;
  status: "draft" | "pending_review" | "active" | "paused" | "rejected";
  createdAt: string;
  updatedAt: string;
};
```

## 8.3 Booking

```ts
type Booking = {
  id: string;
  userId: string;
  parkingSpotId: string;
  startTime: string;
  endTime: string;
  status: "pending" | "confirmed" | "cancelled" | "expired" | "payment_failed";
  totalPrice: number;
  currency: string;
  stripePaymentIntentId?: string;
  createdAt: string;
  updatedAt: string;
};
```

## 8.4 Payment

```ts
type Payment = {
  id: string;
  bookingId: string;
  userId: string;
  amount: number;
  currency: string;
  provider: "stripe";
  providerPaymentIntentId: string;
  status: "requires_payment" | "processing" | "succeeded" | "failed" | "refunded";
  createdAt: string;
  updatedAt: string;
};
```

## 8.5 AvailabilityRule

```ts
type AvailabilityRule = {
  id: string;
  parkingSpotId: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  timezone: string;
};
```

## 8.6 AvailabilityBlock

```ts
type AvailabilityBlock = {
  id: string;
  parkingSpotId: string;
  startTime: string;
  endTime: string;
  reason?: string;
};
```

---

# 9. API Requirements

## 9.1 Driver APIs

The backend should support:

- Search parking by destination coordinates, date, time, duration, and radius.
- Get parking spot details.
- Create pending booking.
- Create payment intent.
- Confirm booking after payment success.
- Cancel booking.
- Get user bookings.

## 9.2 Host APIs

The backend should support:

- Create parking listing.
- Edit parking listing.
- Submit listing for review.
- Pause listing.
- Add availability rules.
- Add blocked dates.
- View bookings for host listings.

## 9.3 Admin APIs

The backend should support:

- Get pending listings.
- Approve listing.
- Reject listing.
- Pause listing.
- View bookings.
- View users.

---

# 10. Example API Shapes

## 10.1 Search Parking

```graphql
query SearchParking(
  $latitude: Float!
  $longitude: Float!
  $radiusKm: Float!
  $startTime: DateTime!
  $endTime: DateTime!
) {
  searchParking(
    latitude: $latitude
    longitude: $longitude
    radiusKm: $radiusKm
    startTime: $startTime
    endTime: $endTime
  ) {
    id
    title
    address
    latitude
    longitude
    type
    pricePerHour
    distanceMeters
    isAvailable
  }
}
```

## 10.2 Create Booking

```graphql
mutation CreateBooking($input: CreateBookingInput!) {
  createBooking(input: $input) {
    id
    status
    totalPrice
    startTime
    endTime
  }
}
```

## 10.3 Create Parking Spot

```graphql
mutation CreateParkingSpot($input: CreateParkingSpotInput!) {
  createParkingSpot(input: $input) {
    id
    status
    title
    address
  }
}
```

---

# 11. MVP Constraints

The MVP should intentionally avoid complexity.

Do not include:

- Dynamic pricing
- Real-time parking sensor integration
- License plate recognition
- Complex routing logic
- Event integrations
- AI recommendations
- Push notifications
- Host ratings
- Driver ratings
- Automated host payouts
- Calendar sync

The MVP should stay focused on:

```text
Search -> Book -> Pay
Host lists spot -> Admin approves -> Spot becomes searchable
```

---

# 12. MVP Launch Strategy

## 12.1 Phase 1: Controlled Launch

Launch in one small area first.

Recommended launch areas:

- Downtown Toronto
- Near Rogers Centre
- Near Scotiabank Arena
- Downtown Vancouver
- Near BC Place
- Near Rogers Arena

## 12.2 Initial Supply

Seed 20 to 50 parking spots manually.

Supply can come from:

- Residential hosts
- Friends and early testers
- Small lot operators
- Manually entered commercial lots

## 12.3 Initial Demand

Target users who need predictable parking:

- Event attendees
- Weekend downtown visitors
- Commuters
- Travellers

---

# 13. MVP Success Metrics

Track:

- Search to booking conversion rate
- Number of bookings per day
- Average booking value
- Number of active parking spots
- Number of active hosts
- Supply utilization rate
- Booking cancellation rate
- Payment failure rate
- Repeat booking rate

---

# 14. Post-MVP Feature: Venue-Based Parking Hubs

## 14.1 Feature Name

Venue-Based Parking Hubs

Alternative names:

- Venue Parking Lists
- Event Parking Hubs
- Destination Parking Collections

---

## 14.2 Feature Summary

Allow hosts with parking spots near high-demand venues to associate their spot with specific venue pages, such as:

- Rogers Centre
- Scotiabank Arena
- CN Tower
- TIFF Bell Lightbox
- BC Place
- Rogers Arena
- Pearson Airport

Drivers looking for parking near a venue should be able to open a dedicated venue page and see available parking spots near that venue.

Example:

A host with a parking spot near Rogers Centre can tag their listing under Rogers Centre Parking. A driver searching for parking near Rogers Centre can open the Rogers Centre venue page and see all available nearby spots.

---

## 14.3 Product Goal

Improve parking discovery by matching users based on destination intent, not just map coordinates.

Many users do not search for parking by address. They search by destination or event location.

Example user intent:

```text
I need parking for Rogers Centre.
```

Not:

```text
I need parking near 1 Blue Jays Way, Toronto.
```

This feature makes the app more useful for:

- Sports events
- Concerts
- Airports
- Tourist attractions
- Convention centres
- Downtown nightlife areas

---

## 14.4 Driver User Flow

1. User searches for a venue, for example:
   - Rogers Centre
   - Scotiabank Arena
   - Pearson Airport

2. App shows a dedicated venue page:
   - Venue name
   - Venue address
   - Map of nearby parking spots
   - List of available parking spots

3. User selects:
   - Date
   - Start time
   - Duration

4. App shows available spots near the venue.

5. User can sort by:
   - Distance
   - Price
   - Walking time
   - Availability

6. User selects a spot.

7. User books and pays.

8. User receives confirmation.

---

## 14.5 Host User Flow

1. Host creates or edits a parking listing.

2. App checks the spot location.

3. App suggests nearby venues automatically.

Example:

```text
Your spot is near:
- Rogers Centre, 450m away
- CN Tower, 600m away
- Ripley's Aquarium, 700m away
```

4. Host selects relevant venues.

5. Listing becomes eligible to appear on those venue pages.

6. Admin may review and approve the venue association.

---

## 14.6 Core Requirements

### Venue Pages

The app should support dedicated venue pages.

Each venue page should include:

- Venue name
- Venue address
- Venue location coordinates
- Parking spots within a configurable radius
- Search date and time picker
- Map view
- List view
- Price
- Distance
- Walking time, if available
- Spot availability

Example routes:

```text
/parking/rogers-centre
/parking/scotiabank-arena
/parking/bc-place
```

### Venue Matching

The system should support two ways of associating parking spots with venues.

#### Automatic Matching

When a host creates a listing, the system should find nearby venues within a configured radius.

Example:

```text
Find all venues within 1.5 km of the parking spot.
```

#### Manual Host Selection

Hosts should be able to choose from suggested venues.

Hosts should not be able to create new venue names directly.

This prevents duplicates like:

- Rogers Center
- Roger Centre
- Rogers Ctr
- The Rogers Stadium

All venues must come from a canonical Venue table.

---

## 14.7 Business Value

This feature creates a stronger competitive advantage because it:

- Matches how users naturally search.
- Improves conversion for event-based parking.
- Helps hosts near popular areas get discovered.
- Creates SEO-friendly landing pages.
- Supports future event-based pricing.
- Supports future partnerships with venues and event organizers.

---

## 14.8 SEO Benefit

Venue pages can become public landing pages targeting searches like:

- Rogers Centre parking
- Cheap parking near Rogers Centre
- Parking near Scotiabank Arena
- Blue Jays parking
- Concert parking Toronto

This can become a major organic acquisition channel.

---

## 14.9 Data Model Updates

### Venue

```ts
type Venue = {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  provinceOrState: string;
  country: string;
  latitude: number;
  longitude: number;
  defaultRadiusKm: number;
  type:
    | "stadium"
    | "arena"
    | "airport"
    | "theatre"
    | "tourist_attraction"
    | "conference_center"
    | "other";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### VenueParkingSpot Association

Use a separate `VenueParkingSpot` table for better flexibility.

```ts
type VenueParkingSpot = {
  id: string;
  venueId: string;
  parkingSpotId: string;
  distanceMeters: number;
  walkingTimeMinutes?: number;
  associationSource: "auto_suggested" | "host_selected" | "admin_added";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
};
```

---

## 14.10 Backend Requirements

The backend should support:

1. Create venue.
2. Update venue.
3. Get venue by slug.
4. Search venues by name.
5. Find nearby venues for a parking spot.
6. Associate parking spot with venue.
7. Remove venue association.
8. Get available parking spots for a venue.
9. Sort venue parking results by price, distance, walking time, and availability.

---

## 14.11 Example API Operations

### Query Venue by Slug

```graphql
query GetVenueBySlug($slug: String!) {
  venueBySlug(slug: $slug) {
    id
    name
    slug
    address
    latitude
    longitude
    defaultRadiusKm
  }
}
```

### Query Available Parking for Venue

```graphql
query GetVenueParking(
  $venueId: ID!
  $startTime: DateTime!
  $endTime: DateTime!
  $radiusKm: Float
) {
  venueParking(
    venueId: $venueId
    startTime: $startTime
    endTime: $endTime
    radiusKm: $radiusKm
  ) {
    spotId
    address
    latitude
    longitude
    pricePerHour
    distanceMeters
    walkingTimeMinutes
    isAvailable
  }
}
```

### Suggest Nearby Venues for Host Listing

```graphql
query SuggestNearbyVenues(
  $latitude: Float!
  $longitude: Float!
  $radiusKm: Float!
) {
  suggestNearbyVenues(
    latitude: $latitude
    longitude: $longitude
    radiusKm: $radiusKm
  ) {
    id
    name
    distanceMeters
    address
  }
}
```

### Associate Spot With Venue

```graphql
mutation AssociateSpotWithVenue($spotId: ID!, $venueId: ID!) {
  associateSpotWithVenue(spotId: $spotId, venueId: $venueId) {
    id
    parkingSpotId
    venueId
    status
  }
}
```

---

## 14.12 Acceptance Criteria

### Driver Experience

- A user can search for a venue by name.
- A user can open a dedicated venue parking page.
- A user can select date, start time, and duration.
- A user can see available parking spots near the venue.
- A user can sort results by price and distance.
- A user can book and pay for a spot from the venue page.

### Host Experience

- A host creating a listing can see nearby venue suggestions.
- A host can associate their parking spot with one or more approved venues.
- A host cannot create arbitrary venue names.
- A host's venue association may require admin approval before going live.

### Admin Experience

- Admin can create and manage canonical venues.
- Admin can approve or reject venue associations.
- Admin can disable a venue.
- Admin can remove a parking spot from a venue page.

---

## 14.13 Out of Scope for First Version

The first version of venue-based parking hubs should not include:

- Live event schedule integrations
- Ticketmaster integration
- Eventbrite integration
- Dynamic event pricing
- Surge pricing
- Venue partnership dashboards
- AI recommendations
- Push alerts when venue parking opens up

---

## 14.14 Future Enhancements

After the first version, this feature can expand to support:

- Event-specific parking pages
- Dynamic pricing during major events
- Best parking for this event recommendations
- Integration with sports schedules
- Integration with concert and event APIs
- Host earnings boost for event days
- Corporate or event organizer partnerships
- Prepaid parking bundles for season-ticket holders

---

## 14.15 Definition of Done

This feature is complete when:

1. Admin can create a venue.
2. Host can associate a parking spot with a venue.
3. Driver can open a venue page.
4. Driver can search available parking near the venue by date and time.
5. Driver can book and pay for a spot from the venue page.
6. Venue pages only use canonical venue records.
7. Duplicate or user-generated venue names are prevented.

---

# 15. Future Features Beyond Venue Hubs

Post-MVP features may include:

- AI-based parking recommendations
- Dynamic pricing engine
- EV charger discovery
- Monthly parking subscriptions
- Corporate accounts
- License plate entry
- Event-specific parking pages
- Walking route guidance
- Push notifications
- User reviews and ratings
- Automated host payouts
- Fraud detection

---

# 16. MVP Definition of Done

The MVP is complete when a driver can:

1. Open the app.
2. Enter a destination address.
3. Set date, time, duration, and radius.
4. See available parking spots.
5. Select a spot.
6. Pay.
7. Receive confirmation.

The MVP is also complete when a host can:

1. Create an account.
2. Create a parking listing.
3. Add availability and pricing.
4. Submit the listing for review.
5. Have the listing approved by admin.
6. Receive bookings.

Admin must be able to:

1. Review listings.
2. Approve or reject listings.
3. View bookings.
4. Pause unsafe or invalid listings.

The MVP should prove the core marketplace loop:

```text
Hosts add supply -> Drivers search and book -> Hosts earn money -> More hosts join
```

