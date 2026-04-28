import { StaffRosterTable } from '@/components/staff/staff-roster-table';

/**
 * Staff admin page — admin scope (enforced by `/admin/layout.tsx`). Lists
 * employment profiles for the current tenant's locations and lets admins
 * upsert profiles (employmentType, hourlyRate, hire date) inline.
 */
export default function AdminStaffPage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">Staff</h2>
        <p className="text-sm text-muted-foreground">
          Employment profiles at the tenant&apos;s locations. Update employment
          type, hourly rate, hire date, and termination date here.
        </p>
      </div>
      <StaffRosterTable />
    </div>
  );
}
