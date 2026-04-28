import { TimeEntriesTable } from '@/components/time-clock/time-entries-table';

/**
 * Time entries report — manager scope (enforced by `./layout.tsx`). Lists
 * time entries at the active location with date-range and user filters.
 * Manager can edit any entry via a dialog that records a manualEditReason.
 */
export default function TimeEntriesPage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Time entries</h1>
        <p className="text-sm text-muted-foreground">
          Review punch-in/out and break totals. Edit any entry to correct
          mistakes — every manual edit is recorded with a reason.
        </p>
      </header>
      <TimeEntriesTable />
    </div>
  );
}
