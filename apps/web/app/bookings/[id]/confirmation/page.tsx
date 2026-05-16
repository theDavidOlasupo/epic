import { ConfirmationPage } from '@/components/booking/confirmation-page';

export default async function BookingConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <ConfirmationPage bookingId={id} />
    </main>
  );
}
