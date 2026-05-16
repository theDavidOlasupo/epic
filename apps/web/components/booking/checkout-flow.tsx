'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import type { Vehicle } from '@alpaca/types';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '');

const SIZE_CLASS_LABELS: Record<string, string> = {
  compact: 'Compact', mid_size: 'Mid-size', full_size: 'Full-size',
  suv: 'SUV', truck: 'Truck', van: 'Van', motorcycle: 'Motorcycle',
};
const SIZE_CLASSES = Object.keys(SIZE_CLASS_LABELS);
const CURRENT_YEAR = new Date().getFullYear();

interface SpotSummary {
  title: string;
  address: string;
  pricePerHour: number;
  entryInstructions: string;
}

interface CheckoutFlowProps {
  spotId: string;
  startTime: string;
  endTime: string;
}

// ── Inner payment form (needs Stripe context) ──────────────────────────────
function PaymentForm({
  bookingId,
  totalPrice,
  currency,
  onSuccess,
}: {
  bookingId: string;
  totalPrice: number;
  currency: string;
  onSuccess: (bookingId: string, totalPrice: number, currency: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  async function handlePay() {
    if (!stripe || !elements) return;
    setPaying(true);
    setError('');

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? 'Payment failed');
      setPaying(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/bookings/${bookingId}/confirmation`,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed');
      setPaying(false);
      return;
    }

    // Payment succeeded without redirect — show confirmation inline
    onSuccess(bookingId, totalPrice, currency);
    setPaying(false);
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button className="w-full" onClick={handlePay} disabled={!stripe || paying}>
        {paying ? 'Processing...' : `Pay $${(totalPrice / 100).toFixed(2)} ${currency}`}
      </Button>
      <p className="text-center text-xs text-gray-400">
        Secured by Stripe. You won't be charged until you click Pay.
      </p>
    </div>
  );
}

// ── Main checkout flow ─────────────────────────────────────────────────────
export function CheckoutFlow({ spotId, startTime, endTime }: CheckoutFlowProps) {
  const { getToken } = useAuth();

  const [spot, setSpot] = useState<SpotSummary | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(true);

  // New vehicle form
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [sizeClass, setSizeClass] = useState('mid_size');
  const [licencePlate, setLicencePlate] = useState('');
  const [licencePlateRegion, setLicencePlateRegion] = useState('ON');

  // Payment state
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [totalPrice, setTotalPrice] = useState(0);
  const [currency, setCurrency] = useState('CAD');
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [error, setError] = useState('');

  // Confirmation state
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedData, setConfirmedData] = useState<{ bookingId: string; totalPrice: number; currency: string } | null>(null);

  const durationHours = (new Date(endTime).getTime() - new Date(startTime).getTime()) / (1000 * 60 * 60);
  const startDateStr = new Date(startTime).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
  const startHourStr = new Date(startTime).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });
  const endHourStr = new Date(endTime).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });

  const init = useCallback(async () => {
    const token = await getToken();
    const [spotRes, vehiclesRes] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/parking-spots/${spotId}`),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me/vehicles`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    if (spotRes.ok) setSpot(await spotRes.json() as SpotSummary);
    if (vehiclesRes.ok) {
      const data = await vehiclesRes.json() as Vehicle[];
      setVehicles(data);
      const def = data.find((v) => v.isDefault) ?? data[0];
      if (def) setSelectedVehicleId(def.id);
      if (data.length === 0) setShowAddForm(true);
    }
    setLoadingVehicles(false);
  }, [spotId, getToken]);

  useEffect(() => { void init(); }, [init]);

  async function handleConfirm() {
    setCreatingBooking(true);
    setError('');
    try {
      const token = await getToken();
      let vehicleId = selectedVehicleId;

      if (showAddForm || !vehicleId) {
        const vRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me/vehicles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ make, model, year: Number(year), sizeClass, licencePlate, licencePlateRegion, isDefault: vehicles.length === 0 }),
        });
        if (!vRes.ok) {
          const err = await vRes.json() as { error: { message: string } };
          setError(err.error?.message ?? 'Failed to save vehicle');
          return;
        }
        vehicleId = (await vRes.json() as Vehicle).id;
      }

      // Create booking
      const bookingRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ parkingSpotId: spotId, vehicleId, startTime, endTime }),
      });
      if (!bookingRes.ok) {
        const err = await bookingRes.json() as { error: { message: string } };
        setError(err.error?.message ?? 'Failed to create booking');
        return;
      }
      const bookingData = await bookingRes.json() as { id: string; totalPrice: number; currency: string };

      // Acquire checkout lock
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/bookings/${bookingData.id}/checkout-lock`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      // Create payment intent — get clientSecret for Stripe Elements
      const intentRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/payments/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: bookingData.id }),
      });
      if (!intentRes.ok) {
        const err = await intentRes.json() as { error: { message: string } };
        setError(err.error?.message ?? 'Payment setup failed');
        return;
      }
      const { clientSecret: cs } = await intentRes.json() as { clientSecret: string };

      setBookingId(bookingData.id);
      setTotalPrice(bookingData.totalPrice);
      setCurrency(bookingData.currency);
      setClientSecret(cs);
    } finally {
      setCreatingBooking(false);
    }
  }

  // ── Confirmation view ────────────────────────────────────────────────────
  if (confirmed && confirmedData) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">✓</div>
          <h2 className="text-2xl font-bold text-gray-900">Booking confirmed!</h2>
          <p className="text-gray-500">Your parking spot is reserved.</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-4 text-left space-y-2">
          <div className="flex justify-between text-sm"><span className="text-gray-500">Address</span><span className="font-medium text-gray-900 text-right max-w-[60%]">{spot?.address}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Date</span><span className="font-medium text-gray-900">{startDateStr}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Time</span><span className="font-medium text-gray-900">{startHourStr} – {endHourStr}</span></div>
          <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
            <span className="text-gray-500">Total paid</span>
            <span className="font-semibold text-gray-900">${(confirmedData.totalPrice / 100).toFixed(2)} {confirmedData.currency}</span>
          </div>
        </div>
        {spot?.entryInstructions && (
          <div className="rounded-xl bg-blue-50 p-4 text-left">
            <p className="text-sm font-medium text-blue-900 mb-1">Entry instructions</p>
            <p className="text-sm text-blue-800">{spot.entryInstructions}</p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          <Button asChild><Link href="/search">Find more parking</Link></Button>
          <Button variant="outline" asChild><Link href="/bookings">View my bookings</Link></Button>
        </div>
      </div>
    );
  }

  const estimatedTotal = spot ? Math.ceil(spot.pricePerHour * durationHours) : 0;

  // ── Payment view (Stripe Elements) ──────────────────────────────────────
  if (clientSecret && bookingId) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-gray-200 p-4 space-y-2 text-sm">
          <h2 className="font-semibold text-gray-900">{spot?.title}</h2>
          <p className="text-gray-500">{spot?.address}</p>
          <div className="flex justify-between border-t border-gray-100 pt-2">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="font-semibold text-gray-900">${(totalPrice / 100).toFixed(2)} {currency}</span>
          </div>
        </div>

        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
          <PaymentForm
            bookingId={bookingId}
            totalPrice={totalPrice}
            currency={currency}
            onSuccess={(id, price, curr) => {
              setConfirmedData({ bookingId: id, totalPrice: price, currency: curr });
              setConfirmed(true);
            }}
          />
        </Elements>
      </div>
    );
  }

  // ── Pre-payment view (vehicle selection) ────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Spot + time summary */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-2">
        <h2 className="font-semibold text-gray-900">{spot?.title ?? '...'}</h2>
        <p className="text-sm text-gray-500">{spot?.address}</p>
        <div className="space-y-1 text-sm text-gray-600 pt-1">
          <div className="flex justify-between"><span>Date</span><span className="font-medium text-gray-900">{startDateStr}</span></div>
          <div className="flex justify-between"><span>Time</span><span className="font-medium text-gray-900">{startHourStr} – {endHourStr}</span></div>
          <div className="flex justify-between"><span>Duration</span><span className="font-medium text-gray-900">{durationHours.toFixed(1)} hrs</span></div>
          <div className="flex justify-between border-t border-gray-100 pt-2">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="font-semibold text-gray-900">${(estimatedTotal / 100).toFixed(2)} CAD</span>
          </div>
        </div>
      </div>

      {/* Vehicle selection */}
      <div>
        <h2 className="mb-3 font-semibold text-gray-900">Your vehicle</h2>
        {loadingVehicles ? <p className="text-sm text-gray-400">Loading vehicles...</p> : (
          <div className="space-y-2">
            {vehicles.map((v) => (
              <label key={v.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${selectedVehicleId === v.id && !showAddForm ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input type="radio" name="vehicle" value={v.id} checked={selectedVehicleId === v.id && !showAddForm} onChange={() => { setSelectedVehicleId(v.id); setShowAddForm(false); }} className="accent-black" />
                <div>
                  <p className="font-medium text-gray-900">{v.year} {v.make} {v.model}{v.isDefault && <span className="ml-2 text-xs text-gray-400">(default)</span>}</p>
                  <p className="text-xs text-gray-500">{SIZE_CLASS_LABELS[v.sizeClass] ?? v.sizeClass} · {v.licencePlate} ({v.licencePlateRegion})</p>
                </div>
              </label>
            ))}
            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${showAddForm ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <input type="radio" name="vehicle" checked={showAddForm} onChange={() => setShowAddForm(true)} className="accent-black" />
              <span className="font-medium text-gray-900">+ Add a new vehicle</span>
            </label>
            {showAddForm && (
              <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[{ label: 'Make', value: make, set: setMake, placeholder: 'Toyota' }, { label: 'Model', value: model, set: setModel, placeholder: 'Camry' }].map(({ label, value, set, placeholder }) => (
                    <div key={label}><label className="text-xs font-medium text-gray-500">{label}</label><input className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" placeholder={placeholder} value={value} onChange={(e) => set(e.target.value)} /></div>
                  ))}
                  <div><label className="text-xs font-medium text-gray-500">Year</label><input type="number" min="1990" max={CURRENT_YEAR + 1} className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" value={year} onChange={(e) => setYear(e.target.value)} /></div>
                  <div><label className="text-xs font-medium text-gray-500">Size</label><select className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" value={sizeClass} onChange={(e) => setSizeClass(e.target.value)}>{SIZE_CLASSES.map((s) => <option key={s} value={s}>{SIZE_CLASS_LABELS[s]}</option>)}</select></div>
                  <div><label className="text-xs font-medium text-gray-500">Licence Plate</label><input className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" placeholder="ABC 123" value={licencePlate} onChange={(e) => setLicencePlate(e.target.value)} /></div>
                  <div><label className="text-xs font-medium text-gray-500">Province/State</label><input className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" placeholder="ON" value={licencePlateRegion} onChange={(e) => setLicencePlateRegion(e.target.value)} /></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
        <p className="font-medium text-gray-900 mb-1">Cancellation policy</p>
        <p>Free cancellation if you cancel more than 1 hour before your booking starts.</p>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button className="w-full" onClick={handleConfirm} disabled={creatingBooking || loadingVehicles || (showAddForm && (!make || !model || !licencePlate))}>
        {creatingBooking ? 'Setting up payment...' : 'Continue to Payment →'}
      </Button>
    </div>
  );
}
