'use client';

import { ThemeProvider } from 'next-themes';
import { Toaster } from '@repo/ui';

/**
 * Root client provider stack: theme + toasts. The urql GraphQL provider lives
 * inside the `(app)` group (and its tenant/location layouts) where the right
 * scope is known — auth pages don't need a client GraphQL client and would
 * waste bundle on one.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster />
    </ThemeProvider>
  );
}
