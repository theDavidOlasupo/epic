import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { MapsProvider } from '@/components/maps-provider';
import { FeedbackWidget } from '@/components/feedback/feedback-widget';
import { Navbar } from '@/components/navbar';
import './globals.css';

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Alpaca Parking',
  description: 'Find parking near your destination',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={geist.variable}>
        <body>
          <Navbar />
          <MapsProvider>{children}</MapsProvider>
          <FeedbackWidget />
        </body>
      </html>
    </ClerkProvider>
  );
}
