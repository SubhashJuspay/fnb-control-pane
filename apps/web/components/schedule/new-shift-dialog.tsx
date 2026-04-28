'use client';

import { useEffect } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@repo/ui';
import { useMutation } from 'urql';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  StaffCreateShiftDocument,
  type JobRolesQuery,
} from '@/lib/graphql/generated/graphql';

type JobRole = NonNullable<NonNullable<JobRolesQuery['jobRoles']>[number]>;

const formSchema = z
  .object({
    jobRoleId: z.string().uuid(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a start time'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Pick an end time'),
    notes: z.string().max(500).optional().nullable(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'End time must be after start time',
    path: ['endTime'],
  });

type FormValues = z.infer<typeof formSchema>;

export interface NewShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  day: Date;
  jobRoles: JobRole[];
  onCreated: () => void;
}

function combineDayAndTime(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  // Anchor to local time so the user types `17:00` and it means 17:00 in
  // their browser timezone. The api stores the absolute UTC instant.
  const out = new Date(day);
  out.setHours(h ?? 0, m ?? 0, 0, 0);
  return out;
}

export function NewShiftDialog({
  open,
  onOpenChange,
  userId,
  day,
  jobRoles,
  onCreated,
}: NewShiftDialogProps): React.JSX.Element {
  const [{ fetching }, createShift] = useMutation(StaffCreateShiftDocument);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      jobRoleId: jobRoles[0]?.id ?? '',
      startTime: '09:00',
      endTime: '17:00',
      notes: null,
    },
    mode: 'onSubmit',
  });
  const { control, register, handleSubmit, formState, reset } = form;

  // Re-seed the form whenever it re-opens.
  useEffect(() => {
    if (open) {
      reset({
        jobRoleId: jobRoles[0]?.id ?? '',
        startTime: '09:00',
        endTime: '17:00',
        notes: null,
      });
    }
  }, [open, reset, jobRoles]);

  const onSubmit = handleSubmit(async (values) => {
    const startsAt = combineDayAndTime(day, values.startTime);
    const endsAt = combineDayAndTime(day, values.endTime);
    const result = await createShift({
      input: {
        userId,
        jobRoleId: values.jobRoleId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        notes: values.notes ?? null,
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Shift added (draft)');
    onCreated();
  });

  const selectClassName = cn(
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New shift</DialogTitle>
          <DialogDescription>
            Adding a draft shift on{' '}
            {day.toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
            . Publish the week to broadcast it.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <div className="grid gap-2">
            <Label htmlFor="new-shift-role">Role</Label>
            <Controller
              control={control}
              name="jobRoleId"
              render={({ field }) => (
                <select
                  id="new-shift-role"
                  className={selectClassName}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                >
                  <option value="">Select a role…</option>
                  {jobRoles.map((r) => (
                    <option key={r.id ?? ''} value={r.id ?? ''}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
            />
            {formState.errors.jobRoleId ? (
              <p className="text-sm text-destructive">
                {formState.errors.jobRoleId.message}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-2">
              <Label htmlFor="new-shift-start">Start</Label>
              <Input
                id="new-shift-start"
                type="time"
                {...register('startTime')}
              />
              {formState.errors.startTime ? (
                <p className="text-sm text-destructive">
                  {formState.errors.startTime.message}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-shift-end">End</Label>
              <Input id="new-shift-end" type="time" {...register('endTime')} />
              {formState.errors.endTime ? (
                <p className="text-sm text-destructive">
                  {formState.errors.endTime.message}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-shift-notes">Notes</Label>
            <Controller
              control={control}
              name="notes"
              render={({ field }) => (
                <Input
                  id="new-shift-notes"
                  placeholder="Optional"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value || null)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                />
              )}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={fetching}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={fetching}>
              {fetching ? 'Saving…' : 'Add shift'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
