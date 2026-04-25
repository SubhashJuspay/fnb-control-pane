import type { ReactNode } from 'react';

/**
 * Full-bleed auth layout. Auth pages live outside the app shell — no
 * sidebar, no top bar. A centered card on a muted background.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4 py-8">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
