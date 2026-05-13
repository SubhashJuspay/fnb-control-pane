import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 py-12"
      style={{
        background:
          'linear-gradient(135deg, var(--m3-background) 0%, var(--m3-primary-fixed) 100%)',
      }}
    >
      <header className="mb-8 flex flex-col items-center">
        <div className="mb-2 flex items-center gap-3">
          <span
            aria-hidden
            className="material-symbols-outlined text-[32px] text-primary"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            restaurant_menu
          </span>
          <h1 className="font-display text-headline-md font-bold text-primary">
            F&amp;B Control Pane
          </h1>
        </div>
        <p className="font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant">
          Operations console
        </p>
      </header>
      <main className="w-full max-w-[420px]">{children}</main>
    </div>
  );
}
