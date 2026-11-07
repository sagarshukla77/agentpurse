import type { Metadata } from 'next';
import { Instrument_Sans, JetBrains_Mono } from 'next/font/google';
import { ToastProvider } from '@/components/ui';
import './globals.css';

const ui = Instrument_Sans({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'AgentPurse: spend authority for AI agents',
  description: 'A policy-enforced payments control plane. AI proposes, code decides, PayPal moves the money.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${mono.variable}`}>
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
