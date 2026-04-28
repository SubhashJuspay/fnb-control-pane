'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  formatMoney,
  type Column,
} from '@repo/ui';
import { toast } from 'sonner';
import {
  AdminTenantLocationsDocument,
  AdminTenantMembersDocument,
  StaffEndEmploymentDocument,
  StaffRosterDocument,
  StaffUpsertEmploymentProfileDocument,
  type EmploymentType,
  type StaffRosterQuery,
} from '@/lib/graphql/generated/graphql';
import {
  EmploymentProfileForm,
  type EmploymentProfileFormValues,
} from '@/components/staff/employment-profile-form';

type Profile = NonNullable<NonNullable<StaffRosterQuery['staffRoster']>[number]>;

interface CandidateUser {
  id: string;
  name: string | null;
  email: string | null;
}

interface CandidateLocation {
  id: string;
  name: string;
  currency: string;
}

const PAGE_SIZE = 100;

function formatDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export function StaffRosterTable(): React.JSX.Element {
  const [{ data: rosterData, fetching }, refetchRoster] = useQuery({
    query: StaffRosterDocument,
  });
  const [{ data: membersData }] = useQuery({
    query: AdminTenantMembersDocument,
    variables: { first: PAGE_SIZE },
  });
  const [{ data: locationsData }] = useQuery({
    query: AdminTenantLocationsDocument,
  });
  const [, upsert] = useMutation(StaffUpsertEmploymentProfileDocument);
  const [, endEmployment] = useMutation(StaffEndEmploymentDocument);

  const [editing, setEditing] = useState<Profile | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState<Profile | null>(null);

  const rows: Profile[] = (rosterData?.staffRoster ?? []).filter(
    (r): r is Profile => r != null,
  );
  const candidateLocations: CandidateLocation[] = useMemo(
    () =>
      (locationsData?.tenantLocations ?? [])
        .filter((l): l is { id: string; name: string; currency: string } =>
          Boolean(l?.id && l?.name && l?.currency),
        )
        .map((l) => ({ id: l.id, name: l.name, currency: l.currency })),
    [locationsData],
  );
  const candidateUsers: CandidateUser[] = useMemo(() => {
    const seen = new Map<string, CandidateUser>();
    for (const edge of membersData?.tenantMembers?.edges ?? []) {
      const user = edge?.node?.user;
      if (!user?.id) continue;
      if (seen.has(user.id)) continue;
      seen.set(user.id, {
        id: user.id,
        name: user.name ?? null,
        email: user.email ?? null,
      });
    }
    return Array.from(seen.values()).sort((a, b) =>
      (a.name ?? a.email ?? '').localeCompare(b.name ?? b.email ?? ''),
    );
  }, [membersData]);

  const refresh = (): void => {
    refetchRoster({ requestPolicy: 'network-only' });
  };

  const onUpsert = async (
    values: EmploymentProfileFormValues,
  ): Promise<void> => {
    const result = await upsert({
      input: {
        userId: values.userId,
        locationId: values.locationId,
        employmentType: values.employmentType as EmploymentType,
        hourlyRateCents: values.hourlyRateCents ?? null,
        hireDate: new Date(values.hireDate),
        terminationDate: values.terminationDate
          ? new Date(values.terminationDate)
          : null,
        notes: values.notes ?? null,
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Employment saved');
    setEditing(null);
    setAdding(false);
    refresh();
  };

  const onEnd = async (): Promise<void> => {
    if (!confirmEnd?.id) return;
    const id = confirmEnd.id;
    const result = await endEmployment({
      input: { id, terminationDate: new Date() },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Employment ended');
    setConfirmEnd(null);
    refresh();
  };

  const columns: Column<Profile>[] = [
    {
      key: 'name',
      header: 'Member',
      cell: (p) => (
        <div className="flex flex-col">
          <span className="font-medium">
            {p.user?.name ?? p.user?.email ?? '—'}
          </span>
          {p.user?.name ? (
            <span className="text-xs text-muted-foreground">
              {p.user.email}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'employmentType',
      header: 'Type',
      cell: (p) => (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-xs">
          {p.employmentType ?? '—'}
        </span>
      ),
    },
    {
      key: 'hireDate',
      header: 'Hire date',
      cell: (p) => formatDate(p.hireDate),
    },
    {
      key: 'hourly',
      header: 'Hourly rate',
      cell: (p) => {
        if (p.hourlyRateCents == null) return '—';
        const currency =
          candidateLocations.find((l) => l.id === p.location?.id)?.currency ??
          'USD';
        return formatMoney(p.hourlyRateCents, currency);
      },
    },
    {
      key: 'location',
      header: 'Location',
      cell: (p) => p.location?.name ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (p) =>
        p.terminationDate ? (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">
            Ended {formatDate(p.terminationDate)}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400">
            Active
          </span>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
            Edit
          </Button>
          {!p.terminationDate ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmEnd(p)}
            >
              End
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="flex items-center justify-end">
        <Button onClick={() => setAdding(true)}>Add employment</Button>
      </div>
      {fetching && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading staff…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id ?? ''}
          emptyTitle="No staff yet"
          emptyDescription="Add an employment profile for a tenant member."
        />
      )}

      <Dialog
        open={adding}
        onOpenChange={(o) => {
          if (!o) setAdding(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add employment</DialogTitle>
            <DialogDescription>
              Pick a member and assign them to a location with an employment
              type and hourly rate.
            </DialogDescription>
          </DialogHeader>
          <EmploymentProfileForm
            mode="create"
            users={candidateUsers}
            locations={candidateLocations}
            onSubmit={onUpsert}
            onCancel={() => setAdding(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit employment</DialogTitle>
            <DialogDescription>
              Update employment type, hourly rate, or hire date for this
              member.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <EmploymentProfileForm
              mode="edit"
              users={candidateUsers}
              locations={candidateLocations}
              initial={{
                userId: editing.user?.id ?? '',
                locationId: editing.location?.id ?? '',
                employmentType: (editing.employmentType ?? 'FULL_TIME') as
                  | 'FULL_TIME'
                  | 'PART_TIME'
                  | 'CONTRACTOR',
                hourlyRateCents: editing.hourlyRateCents ?? null,
                hireDate: editing.hireDate
                  ? new Date(editing.hireDate as string).toISOString().slice(0, 10)
                  : '',
                terminationDate: editing.terminationDate
                  ? new Date(editing.terminationDate as string)
                      .toISOString()
                      .slice(0, 10)
                  : null,
                notes: editing.notes ?? null,
              }}
              onSubmit={onUpsert}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmEnd !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmEnd(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End employment?</DialogTitle>
            <DialogDescription>
              Records today as the termination date for{' '}
              {confirmEnd?.user?.name ?? confirmEnd?.user?.email ?? 'this member'}.
              Existing time entries are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEnd(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onEnd}>
              End employment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
