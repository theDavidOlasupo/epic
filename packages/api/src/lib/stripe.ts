import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key || key === 'sk_test_placeholder') {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  _stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia' });
  return _stripe;
}
