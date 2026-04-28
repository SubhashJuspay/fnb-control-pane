'use client';

import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  type Column,
} from '@repo/ui';
import { createJobRoleSchema, updateJobRoleSchema } from '@repo/validation/staff';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  JobRolesDocument,
  StaffArchiveJobRoleDocument,
  StaffCreateJobRoleDocument,
  StaffUpdateJobRoleDocument,
  type JobRolesQuery,
} from '@/lib/graphql/generated/graphql';

type JobRole = NonNullable<NonNullable<JobRolesQuery['jobRoles']>[number]>;

interface CreateValues {
  name: string;
  color: string;
}

interface EditValues {
  name: string;
  color: string;
}

const DEFAULT_COLOR = '#6366f1';

export function JobRolesTable(): React.JSX.Element {
  const [{ data, fetching }, refetch] = useQuery({ query: JobRolesDocument });
  const [, createJobRole] = useMutation(StaffCreateJobRoleDocument);
  const [, updateJobRole] = useMutation(StaffUpdateJobRoleDocument);
  const [, archiveJobRole] = useMutation(StaffArchiveJobRoleDocument);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<JobRole | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<JobRole | null>(null);

  const rows: JobRole[] = (data?.jobRoles ?? []).filter(
    (r): r is JobRole => r != null,
  );

  const refresh = (): void => {
    refetch({ requestPolicy: 'network-only' });
  };

  const onArchive = async (): Promise<void> => {
    if (!confirmArchive?.id) return;
    const id = confirmArchive.id;
    const result = await archiveJobRole({ input: { id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Job role archived');
    setConfirmArchive(null);
    refresh();
  };

  const columns: Column<JobRole>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-full border"
            style={{ background: r.color ?? DEFAULT_COLOR }}
          />
          <span className="font-medium">{r.name ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'color',
      header: 'Color',
      cell: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {r.color ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) =>
        r.archivedAt ? (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">
            Archived
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
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Job role actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(r)}>Edit</DropdownMenuItem>
            {!r.archivedAt ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmArchive(r)}
              >
                Archive
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <div className="flex items-center justify-end">
        <Button onClick={() => setCreateOpen(true)}>New job role</Button>
      </div>
      {fetching && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading job roles…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id ?? ''}
          emptyTitle="No job roles yet"
          emptyDescription="Create roles like Server, Bartender, Cook to assign on the schedule."
        />
      )}

      <CreateJobRoleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={async (values) => {
          const result = await createJobRole({
            input: { name: values.name, color: values.color },
          });
          if (result.error) {
            toast.error(result.error.message);
            return;
          }
          toast.success('Job role created');
          setCreateOpen(false);
          refresh();
        }}
      />

      <EditJobRoleDialog
        role={editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        onSubmit={async (values) => {
          if (!editing?.id) return;
          const id = editing.id;
          const result = await updateJobRole({
            input: { id, name: values.name, color: values.color },
          });
          if (result.error) {
            toast.error(result.error.message);
            return;
          }
          toast.success('Job role updated');
          setEditing(null);
          refresh();
        }}
      />

      <Dialog
        open={confirmArchive !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmArchive(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive job role?</DialogTitle>
            <DialogDescription>
              {confirmArchive?.name} will be hidden from new shift assignments
              but kept on existing shifts and time entries.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmArchive(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onArchive}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: CreateValues) => Promise<void>;
}

function CreateJobRoleDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateDialogProps): React.JSX.Element {
  const form = useForm<CreateValues>({
    resolver: zodResolver(createJobRoleSchema) as Resolver<CreateValues>,
    defaultValues: { name: '', color: DEFAULT_COLOR },
    mode: 'onSubmit',
  });
  const { register, handleSubmit, formState, reset } = form;
  const onSubmit = handleSubmit(async (values) => {
    await onCreate(values);
    reset({ name: '', color: DEFAULT_COLOR });
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset({ name: '', color: DEFAULT_COLOR });
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New job role</DialogTitle>
          <DialogDescription>
            Pick a short name and a color used to render shifts on the schedule.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <div className="grid gap-2">
            <Label htmlFor="job-role-name">Name</Label>
            <Input
              id="job-role-name"
              autoComplete="off"
              {...register('name')}
              aria-invalid={Boolean(formState.errors.name)}
            />
            {formState.errors.name ? (
              <p className="text-sm text-destructive">
                {formState.errors.name.message}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="job-role-color">Color</Label>
            <Input
              id="job-role-color"
              type="color"
              className="h-10 w-20 p-1"
              {...register('color')}
            />
            {formState.errors.color ? (
              <p className="text-sm text-destructive">
                {formState.errors.color.message}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={formState.isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? 'Saving…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EditDialogProps {
  role: JobRole | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: EditValues) => Promise<void>;
}

function EditJobRoleDialog({
  role,
  onOpenChange,
  onSubmit: onSubmitProp,
}: EditDialogProps): React.JSX.Element {
  const form = useForm<EditValues>({
    resolver: zodResolver(
      updateJobRoleSchema.pick({ name: true, color: true }),
    ) as Resolver<EditValues>,
    defaultValues: { name: '', color: DEFAULT_COLOR },
    values: role
      ? { name: role.name ?? '', color: role.color ?? DEFAULT_COLOR }
      : undefined,
    mode: 'onSubmit',
  });
  const { register, handleSubmit, formState } = form;
  const onSubmit = handleSubmit(async (values) => {
    await onSubmitProp(values);
  });
  return (
    <Dialog
      open={role !== null}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit job role</DialogTitle>
          <DialogDescription>
            Rename the role or pick a new color. Existing shifts inherit the
            change.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <div className="grid gap-2">
            <Label htmlFor="job-role-edit-name">Name</Label>
            <Input
              id="job-role-edit-name"
              autoComplete="off"
              {...register('name')}
              aria-invalid={Boolean(formState.errors.name)}
            />
            {formState.errors.name ? (
              <p className="text-sm text-destructive">
                {formState.errors.name.message}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="job-role-edit-color">Color</Label>
            <Input
              id="job-role-edit-color"
              type="color"
              className="h-10 w-20 p-1"
              {...register('color')}
            />
            {formState.errors.color ? (
              <p className="text-sm text-destructive">
                {formState.errors.color.message}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={formState.isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
