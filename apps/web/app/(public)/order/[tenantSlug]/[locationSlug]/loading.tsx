/**
 * Fallback shown while the storefront / checkout / confirmation / track /
 * receipt pages are server-rendering. Renders inside a `<Suspense>` boundary
 * Next.js wraps around any page in this segment.
 *
 * Why this exists: the Render-hosted API is on a free tier that sleeps after
 * 15 min idle. The first request after a quiet period waits 30-60s for the
 * instance to wake. Without a loading state, the browser sits on a blank
 * page and the user thinks the site is broken. This skeleton signals work is
 * happening.
 */
export default function OrderLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <header className="flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface px-container-margin shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-6 w-40 animate-pulse rounded-md bg-surface-container" />
          <div className="hidden h-7 w-44 animate-pulse rounded-full bg-surface-container md:block" />
        </div>
        <div className="h-10 w-32 animate-pulse rounded-full bg-surface-container" />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-container-margin py-stack-loose">
        <div
          className="mb-stack-loose h-[280px] w-full animate-pulse rounded-xl bg-surface-container sm:h-[320px]"
          aria-hidden
        />
        <div className="mb-gutter grid gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="size-5 animate-pulse rounded bg-surface-container" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-3 w-20 animate-pulse rounded bg-surface-container" />
                <div className="h-4 w-32 animate-pulse rounded bg-surface-container-high" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-14 w-full animate-pulse rounded-xl bg-surface-container" />
        <div className="mt-gutter flex gap-gutter">
          <div className="hidden w-[240px] shrink-0 flex-col gap-2 md:flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 w-full animate-pulse rounded-lg bg-surface-container"
              />
            ))}
          </div>
          <div className="grid flex-1 grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-0 shadow-card-soft"
              >
                <div className="aspect-[4/3] w-full animate-pulse bg-surface-container" />
                <div className="flex flex-col gap-2 p-card-padding">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-surface-container-high" />
                  <div className="h-3 w-full animate-pulse rounded bg-surface-container" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-full bg-surface-container-lowest px-4 py-2 shadow-overlay-soft"
      >
        <span
          aria-hidden
          className="material-symbols-outlined animate-spin text-[18px] text-primary"
        >
          progress_activity
        </span>
        <span className="text-body-staff text-on-surface-variant">
          Loading…
        </span>
      </div>
    </div>
  );
}
