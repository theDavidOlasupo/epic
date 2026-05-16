import { AuthButtons } from '@/components/auth-buttons';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white">
      <div className="text-center flex flex-col items-center">
        <h1 className="text-4xl font-bold text-gray-900">🦙 Alpaca Parking</h1>
        <p className="mt-3 text-lg text-gray-500">Find parking near your destination</p>
        <AuthButtons />
      </div>
    </main>
  );
}
