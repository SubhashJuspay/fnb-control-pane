import { JobRolesTable } from '@/components/staff/job-roles-table';

/**
 * Job roles admin page — admin scope (enforced by `/admin/layout.tsx`). Lists
 * tenant job roles and lets admins create, rename, recolor, or archive them.
 */
export default function AdminJobRolesPage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">Job roles</h2>
        <p className="text-sm text-muted-foreground">
          Roles you can assign to shifts (e.g. Server, Bartender, Cook). The
          color appears on the schedule editor and time entries.
        </p>
      </div>
      <JobRolesTable />
    </div>
  );
}
