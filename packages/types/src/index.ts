// ─────────────────────────────────────────────
// Enums / union types
// ─────────────────────────────────────────────

export type UserRole = 'driver' | 'host' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'banned';
export type SpotType = 'driveway' | 'garage' | 'lot' | 'underground' | 'other';
export type VehicleSizeClass =
  | 'compact'
  | 'mid_size'
  | 'full_size'
  | 'suv'
  | 'truck'
  | 'van'
  | 'motorcycle';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'payment_failed';
export type PaymentStatus =
  | 'requires_payment'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded';
export type ListingStatus = 'draft' | 'pending_review' | 'active' | 'paused' | 'rejected';
export type PayoutStatus = 'pending' | 'paid' | 'cancelled';

// ─────────────────────────────────────────────
// Domain entities
// ─────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  phoneNumber?: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
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
  pricePerHour: number; // cents
  photos: string[]; // S3 keys or URLs
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
  pricePerHour: number; // cents
  distanceMeters: number;
  isCovered: boolean;
  isAvailable: boolean;
  primaryPhotoUrl: string | null;
}

export interface AvailabilityRule {
  id: string;
  parkingSpotId: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
  startTime: string; // HH:MM 24-hour
  endTime: string; // HH:MM 24-hour
  timezone: string; // IANA e.g. "America/Toronto"
}

export interface AvailabilityBlock {
  id: string;
  parkingSpotId: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  reason?: string;
}

export interface Booking {
  id: string;
  driverId: string;
  parkingSpotId: string;
  vehicleId: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  totalPrice: number; // cents
  currency: string; // ISO 4217
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
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  expiresAt: string; // ISO 8601, now + 10 min
  createdAt: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  driverId: string;
  amount: number; // cents
  currency: string; // ISO 4217
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
  grossAmount: number; // cents
  platformFeeAmount: number; // cents
  hostEarnings: number; // cents
  currency: string; // ISO 4217
  status: PayoutStatus;
  paidAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────
// API error shape
// ─────────────────────────────────────────────

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ─────────────────────────────────────────────
// Request / Response shapes
// ─────────────────────────────────────────────

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

export interface CreateVehicleRequest {
  make: string;
  model: string;
  year: number;
  sizeClass: VehicleSizeClass;
  licencePlate: string;
  licencePlateRegion: string;
  isDefault?: boolean;
}

export interface CreateParkingSpotRequest {
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  type: SpotType;
  pricePerHour: number;
  entryInstructions: string;
  isCovered: boolean;
  allowOvernight: boolean;
  maxVehicleSize?: VehicleSizeClass;
  heightRestrictionCm?: number;
  rules?: string[];
}

export interface CreateAvailabilityRuleRequest {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  timezone: string;
}

export interface CreateAvailabilityBlockRequest {
  startTime: string;
  endTime: string;
  reason?: string;
}

export interface CancelBookingRequest {
  reason?: string;
}

export interface AdminRejectListingRequest {
  reason: string;
}

export interface UpdateUserStatusRequest {
  status: UserStatus;
}

// ─────────────────────────────────────────────
// JWT / Auth context
// ─────────────────────────────────────────────

export interface AuthContext {
  userId: string; // internal DB user id
  clerkUserId: string;
  role: UserRole;
  status: UserStatus;
}
