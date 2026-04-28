'use client';

import { useEffect, useState } from 'react';
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
  ShiftStatus,
  StaffPublishShiftDocument,
  StaffUpdateShiftDocument,
  type JobRolesQuery,
  type ScheduleForWeekQuery,
} from '@/lib/graphql/generated/graphql';
import { CancelShiftDialog } from '@/components/schedule/cancel-shift-dialog';

type Shift = NonNullable<NonNullable<ScheduleForWeekQuery['scheduleForWeek']>[number]>;
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

export interface EditShiftPopoverProps {
  shift: Shift | null;
  jobRoles: JobRole[];
  onClose: () => void;
  onChanged: () => void;
}

function dayPart(value: unknown): Date {
  const d = new Date(value as string);
  d.setHours(0, 0, 0, 0);
  return d;
}

function timePart(value: unknown): string {
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '00:00';
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

function combine(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const out = new Date(day);
  out.setHours(h ?? 0, m ?? 0, 0, 0);
  return out;
}

export function EditShiftPopover({
  shift,
  jobRoles,
  onClose,
  onChanged,
}: EditShiftPopoverProps): React.JSX.Element {
  const [{ fetching: updating }, updateShift] = useMutation(
    StaffUpdateShiftDocument,
  );
  const [{ fetching: publishing }, publishShift] = useMutation(
    StaffPublishShiftDocument,
  );
  const [cancelling, setCancelling] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      jobRoleId: '',
      startTime: '09:00',
      endTime: '17:00',
      notes: null,
    },
    mode: 'onSubmit',
  });
  const { control, register, handleSubmit, formState, reset } = form;

  useEffect(() => {
    if (shift) {
      reset({
        jobRoleId: shift.jobRole?.id ?? '',
        startTime: timePart(shift.startsAt),
        endTime: timePart(shift.endsAt),
        notes: shift.notes ?? null,
      });
    }
  }, [shift, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!shift?.id || !shift?.startsAt) return;
    const day = dayPart(shift.startsAt);
    const result = await updateShift({
      input: {
        id: shift.id,
        jobRoleId: values.jobRoleId,
        startsAt: combine(day, values.startTime).toISOString(),
        endsAt: combine(day, values.endTime).toISOString(),
        notes: values.notes ?? null,
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Shift updated');
    onChanged();
  });

  const onPublish = async (): Promise<void> => {
    if (!shift?.id) return;
    const id = shift.id;
    const result = await publishShift({ input: { id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Shift published');
    onChanged();
  };

  const selectClassName = cn(
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  );

  return (
    <>
      <Dialog
        open={shift !== null && !cancelling}
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit shift</DialogTitle>
            <DialogDescription>
              {shift?.user?.name ?? shift?.user?.email ?? 'Member'} ·{' '}
              {shift?.startsAt
                ? new Date(shift.startsAt as string).toLocaleDateString(
                    undefined,
                    { weekday: 'long', month: 'short', day: 'numeric' },
                  )
                : ''}
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={onSubmit} noValidate>
            <div className="grid gap-2">
              <Label htmlFor="edit-shift-role">Role</Label>
              <Controller
                control={control}
                name="jobRoleId"
                render={({ field }) => (
                  <select
                    id="edit-shift-role"
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
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="edit-shift-start">Start</Label>
                <Input
                  id="edit-shift-start"
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
                <Label htmlFor="edit-shift-end">End</Label>
                <Input
                  id="edit-shift-end"
                  type="time"
                  {...register('endTime')}
                />
                {formState.errors.endTime ? (
                  <p className="text-sm text-destructive">
                    {formState.errors.endTime.message}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-shift-notes">Notes</Label>
              <Controller
                control={control}
                name="notes"
                render={({ field }) => (
                  <Input
                    id="edit-shift-notes"
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
            <DialogFooter className="flex-wrap items-center justify-between gap-2 sm:justify-between">
              <div className="flex gap-2">
                {shift?.status === ShiftStatus.Draft ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onPublish}
                    disabled={publishing}
                  >
                    {publishing ? 'Publishing…' : 'Publish'}
                  </Button>
                ) : null}
                {shift?.status !== ShiftStatus.Cancelled ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setCancelling(true)}
                  >
                    Cancel shift
                  </Button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Close
                </Button>
                <Button type="submit" disabled={updating}>
                  {updating ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <CancelShiftDialog
        shift={cancelling ? shift : null}
        onClose={() => setCancelling(false)}
        onCancelled={() => {
          setCancelling(false);
          onChanged();
        }}
      />
    </>
  );
}
