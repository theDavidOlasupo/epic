import type {
  EmailPayload,
  EmailMessage,
} from './types.js';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
}

function formatPrice(cents: number, currency: string) {
  return `$${(cents / 100).toFixed(2)} ${currency}`;
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="border-bottom:2px solid #000;padding-bottom:16px;margin-bottom:24px">
    <h1 style="margin:0;font-size:24px">🦙 Alpaca Parking</h1>
  </div>
  ${body}
  <div style="border-top:1px solid #eee;margin-top:32px;padding-top:16px;font-size:12px;color:#999">
    <p>Alpaca Parking · Toronto, ON · <a href="https://alpacaparking.com">alpacaparking.com</a></p>
  </div>
</body>
</html>`;
}

export function buildEmailMessage(payload: EmailPayload): EmailMessage {
  switch (payload.type) {
    case 'booking_confirmed_driver': {
      const subject = `Booking confirmed — ${payload.spotAddress}`;
      const html = layout(subject, `
        <h2>Your parking is confirmed! 🎉</h2>
        <p>Hi ${payload.driverName},</p>
        <p>Your booking has been confirmed. Here are the details:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Address</td><td style="padding:8px;border-bottom:1px solid #eee"><strong>${payload.spotAddress}</strong></td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Date</td><td style="padding:8px;border-bottom:1px solid #eee">${formatDate(payload.startTime)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Time</td><td style="padding:8px;border-bottom:1px solid #eee">${formatTime(payload.startTime)} – ${formatTime(payload.endTime)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Total paid</td><td style="padding:8px;border-bottom:1px solid #eee">${formatPrice(payload.totalPrice, payload.currency)}</td></tr>
          <tr><td style="padding:8px;color:#666">Booking ID</td><td style="padding:8px;font-family:monospace;font-size:12px">${payload.bookingId}</td></tr>
        </table>
        <div style="background:#f0f9ff;border-left:4px solid #0ea5e9;padding:12px 16px;margin:16px 0">
          <strong>Entry instructions</strong><br>${payload.entryInstructions}
        </div>
        <p style="font-size:13px;color:#666"><strong>Cancellation policy:</strong> ${payload.cancellationPolicy}</p>
      `);
      return { to: payload.to, subject, html, text: `Booking confirmed for ${payload.spotAddress} on ${formatDate(payload.startTime)} ${formatTime(payload.startTime)}–${formatTime(payload.endTime)}. Total: ${formatPrice(payload.totalPrice, payload.currency)}.` };
    }

    case 'booking_confirmed_host': {
      const subject = `New booking — ${payload.spotAddress}`;
      const html = layout(subject, `
        <h2>You have a new booking! 🚗</h2>
        <p>Hi ${payload.hostName},</p>
        <p>A driver has booked your parking spot.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Address</td><td style="padding:8px;border-bottom:1px solid #eee"><strong>${payload.spotAddress}</strong></td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Date</td><td style="padding:8px;border-bottom:1px solid #eee">${formatDate(payload.startTime)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Time</td><td style="padding:8px;border-bottom:1px solid #eee">${formatTime(payload.startTime)} – ${formatTime(payload.endTime)}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Driver</td><td style="padding:8px;border-bottom:1px solid #eee">${payload.driverName}</td></tr>
          <tr><td style="padding:8px;color:#666">Vehicle plate</td><td style="padding:8px">${payload.vehicleLicencePlate}</td></tr>
        </table>
      `);
      return { to: payload.to, subject, html };
    }

    case 'payment_receipt': {
      const subject = `Payment receipt — ${formatPrice(payload.amount, payload.currency)}`;
      const html = layout(subject, `
        <h2>Payment received ✓</h2>
        <p>Hi ${payload.driverName},</p>
        <p>Your payment has been processed successfully.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Amount</td><td style="padding:8px;border-bottom:1px solid #eee"><strong>${formatPrice(payload.amount, payload.currency)}</strong></td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Booking ID</td><td style="padding:8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${payload.bookingId}</td></tr>
          <tr><td style="padding:8px;color:#666">Payment ref</td><td style="padding:8px;font-family:monospace;font-size:12px">${payload.stripePaymentIntentId}</td></tr>
        </table>
      `);
      return { to: payload.to, subject, html };
    }

    case 'booking_cancelled_driver': {
      const subject = `Booking cancelled — ${payload.spotAddress}`;
      const html = layout(subject, `
        <h2>Booking cancelled</h2>
        <p>Hi ${payload.driverName},</p>
        <p>Your booking has been cancelled.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Address</td><td style="padding:8px;border-bottom:1px solid #eee">${payload.spotAddress}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Date</td><td style="padding:8px;border-bottom:1px solid #eee">${formatDate(payload.startTime)}</td></tr>
          <tr><td style="padding:8px;color:#666">Refund</td><td style="padding:8px">${payload.refunded ? '✓ Full refund issued' : 'No refund (cancelled within 1 hour of start)'}</td></tr>
        </table>
      `);
      return { to: payload.to, subject, html };
    }

    case 'booking_cancelled_host': {
      const subject = `Booking cancelled — ${payload.spotAddress}`;
      const html = layout(subject, `
        <h2>A booking was cancelled</h2>
        <p>Hi ${payload.hostName},</p>
        <p>A driver has cancelled their booking for your spot.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Address</td><td style="padding:8px;border-bottom:1px solid #eee">${payload.spotAddress}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Date</td><td style="padding:8px;border-bottom:1px solid #eee">${formatDate(payload.startTime)}</td></tr>
          <tr><td style="padding:8px;color:#666">Time</td><td style="padding:8px">${formatTime(payload.startTime)} – ${formatTime(payload.endTime)}</td></tr>
        </table>
        <p>The time slot is now available for new bookings.</p>
      `);
      return { to: payload.to, subject, html };
    }

    case 'listing_approved': {
      const subject = `Your listing is live — ${payload.spotTitle}`;
      const html = layout(subject, `
        <h2>Your listing is approved! 🎉</h2>
        <p>Hi ${payload.hostName},</p>
        <p>Your parking spot <strong>${payload.spotTitle}</strong> has been approved and is now live on Alpaca Parking.</p>
        <p>Drivers can now find and book your spot.</p>
      `);
      return { to: payload.to, subject, html };
    }

    case 'listing_rejected': {
      const subject = `Listing update — ${payload.spotTitle}`;
      const html = layout(subject, `
        <h2>Listing not approved</h2>
        <p>Hi ${payload.hostName},</p>
        <p>Unfortunately your listing <strong>${payload.spotTitle}</strong> was not approved.</p>
        <div style="background:#fff3f3;border-left:4px solid #ef4444;padding:12px 16px;margin:16px 0">
          <strong>Reason:</strong> ${payload.reason}
        </div>
        <p>You can edit your listing and resubmit for review.</p>
      `);
      return { to: payload.to, subject, html };
    }

    case 'listing_pending_review': {
      const subject = `New listing pending review — ${payload.spotTitle}`;
      const html = layout(subject, `
        <h2>New listing needs review 📋</h2>
        <p>A host has submitted a new listing for approval.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Title</td><td style="padding:8px;border-bottom:1px solid #eee"><strong>${payload.spotTitle}</strong></td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Host</td><td style="padding:8px;border-bottom:1px solid #eee">${payload.hostName}</td></tr>
          <tr><td style="padding:8px;color:#666">Address</td><td style="padding:8px">${payload.spotAddress}</td></tr>
        </table>
        <p>Log in to the admin dashboard to review and approve or reject this listing.</p>
      `);
      return { to: payload.to, subject, html };
    }
  }
}
