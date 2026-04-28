import { MyScheduleList } from '@/components/schedule/my-schedule-list';

/**
 * My schedule page — staff scope (enforced by `./layout.tsx`). Lists the
 * viewer's upcoming PUBLISHED shifts at this location.
 */
export default function MySchedulePage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">My schedule</h1>
        <p className="text-sm text-muted-foreground">
          Upcoming published shifts at this location, grouped by day.
        </p>
      </header>
      <MyScheduleList />
    </div>
  );
}
