// ── Email provider interface ───────────────────────────────────────────────
// All email providers must implement this interface.
// Swapping providers = changing EMAIL_PROVIDER env var + no code changes.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string; // plain-text fallback
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

// ── Email types ────────────────────────────────────────────────────────────
// Strongly-typed payloads for each notification.

export interface BookingConfirmedDriverPayload {
  type: 'booking_confirmed_driver';
  to: string;
  driverName: string;
  bookingId: string;
  spotAddress: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  currency: string;
  entryInstructions: string;
  cancellationPolicy: string;
}

export interface BookingConfirmedHostPayload {
  type: 'booking_confirmed_host';
  to: string;
  hostName: string;
  bookingId: string;
  spotAddress: string;
  startTime: string;
  endTime: string;
  driverName: string;
  vehicleLicencePlate: string;
}

export interface PaymentReceiptPayload {
  type: 'payment_receipt';
  to: string;
  driverName: string;
  bookingId: string;
  amount: number;
  currency: string;
  stripePaymentIntentId: string;
}

export interface BookingCancelledDriverPayload {
  type: 'booking_cancelled_driver';
  to: string;
  driverName: string;
  bookingId: string;
  spotAddress: string;
  startTime: string;
  endTime: string;
  refunded: boolean;
}

export interface BookingCancelledHostPayload {
  type: 'booking_cancelled_host';
  to: string;
  hostName: string;
  bookingId: string;
  spotAddress: string;
  startTime: string;
  endTime: string;
}

export interface ListingApprovedPayload {
  type: 'listing_approved';
  to: string;
  hostName: string;
  spotTitle: string;
}

export interface ListingRejectedPayload {
  type: 'listing_rejected';
  to: string;
  hostName: string;
  spotTitle: string;
  reason: string;
}

export type EmailPayload =
  | BookingConfirmedDriverPayload
  | BookingConfirmedHostPayload
  | PaymentReceiptPayload
  | BookingCancelledDriverPayload
  | BookingCancelledHostPayload
  | ListingApprovedPayload
  | ListingRejectedPayload;
