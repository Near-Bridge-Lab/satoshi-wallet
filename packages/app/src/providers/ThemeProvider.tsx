'use client';
import { NextUIProvider } from '@nextui-org/react';
import { useRouter } from 'next/navigation';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { Suspense } from 'react';
import Loading from '@/components/basic/Loading';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <Suspense fallback={<Loading />}>
      <NextUIProvider navigate={router.push}>
        <NextThemesProvider attribute="class" defaultTheme="dark">
          {children}
        </NextThemesProvider>
      </NextUIProvider>
    </Suspense>
  );
}
