import type { Metadata } from 'next';
import { Gantari } from 'next/font/google';
import './globals.css';
import ThemeProvider from '@/providers/ThemeProvider';
import { MessageBoxProvider } from '@/providers/MessageBoxProvider';
import ToastProvider from '@/providers/ToastProvider';

const gantari = Gantari({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'IKey Wallet',
  description: 'IKey Wallet',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${gantari.className} antialiased`}>
        <ThemeProvider>
          <ToastProvider>
            <MessageBoxProvider>
              <>{children}</>
            </MessageBoxProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
