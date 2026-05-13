/**
 * Top-level Suspense fallback for every authenticated route. Without this,
 * Next.js renders nothing during navigation and the previous page stays
 * frozen until the new server tree is ready — feels like the app stalled.
 *
 * Renders a lightweight skeleton sized like a typical page. Sits inside the
 * `(app)` shell so the sidebar + header (already in the client tree) stay
 * visible while the inner content streams in.
 */
export default function AppLoading(): React.JSX.Element {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex animate-pulse flex-col gap-4"
    >
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="h-4 w-72 rounded-md bg-muted/70" />
      <div className="mt-2 grid gap-3">
        <div className="h-12 w-full rounded-md bg-muted/60" />
        <div className="h-12 w-full rounded-md bg-muted/60" />
        <div className="h-12 w-full rounded-md bg-muted/60" />
        <div className="h-12 w-full rounded-md bg-muted/60" />
      </div>
    </div>
  );
}
