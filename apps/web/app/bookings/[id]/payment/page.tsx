import { PaymentPage } from '@/components/booking/payment-page';

export default async function BookingPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6">
        <a href="/search" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to search
        </a>
      </div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Payment</h1>
      <PaymentPage bookingId={id} />
    </main>
  );
}
