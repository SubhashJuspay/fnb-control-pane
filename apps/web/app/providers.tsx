'use client';

import { ThemeProvider } from 'next-themes';
import { Toaster } from '@repo/ui';

/**
 * Root client provider stack. The GraphQL provider is added in Task 20.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster />
    </ThemeProvider>
  );
}
