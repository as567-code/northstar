import type { Metadata } from 'next';
import { Instrument_Serif, Inter_Tight, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
});

const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter-tight',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Northstar — Portfolio for everyday investors',
  description:
    'See where your money sits, what could go wrong, and what to do about it. Built for clarity, not speed.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={[
          instrument.variable,
          interTight.variable,
          jetbrains.variable,
          'font-sans antialiased bg-paper text-ink min-h-[100dvh]',
        ].join(' ')}
      >
        {children}
        <div className="paper-grain" aria-hidden="true" />
      </body>
    </html>
  );
}
