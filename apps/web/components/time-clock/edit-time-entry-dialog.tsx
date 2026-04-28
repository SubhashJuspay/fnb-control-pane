'use client';

import { useEffect } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
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
  TimeClockEditTimeEntryDocument,
  type TimeEntriesQuery,
} from '@/lib/graphql/generated/graphql';

type TimeEntry = NonNullable<NonNullable<TimeEntriesQuery['timeEntries']>[number]>;

const formSchema = z.object({
  clockedInAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Pick a date and time'),
  clockedOutAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Pick a date and time')
    .nullable(),
  totalBreakMinutes: z
    .number({ invalid_type_error: 'Enter a number' })
    .int()
    .min(0)
    .nullable(),
  manualEditReason: z.string().trim().min(2).max(500),
});
type FormValues = z.infer<typeof formSchema>;

function toLocalInput(value: unknown): string {
  if (!value) return '';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${mi}`;
}

function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

export interface EditTimeEntryDialogProps {
  entry: TimeEntry | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditTimeEntryDialog({
  entry,
  onClose,
  onSaved,
}: EditTimeEntryDialogProps): React.JSX.Element {
  const [{ fetching }, editEntry] = useMutation(TimeClockEditTimeEntryDocument);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      clockedInAt: '',
      clockedOutAt: null,
      totalBreakMinutes: null,
      manualEditReason: '',
    },
    mode: 'onSubmit',
  });
  const { control, register, handleSubmit, formState, reset } = form;

  useEffect(() => {
    if (entry) {
      reset({
        clockedInAt: toLocalInput(entry.clockedInAt),
        clockedOutAt: entry.clockedOutAt
          ? toLocalInput(entry.clockedOutAt)
          : null,
        totalBreakMinutes: entry.totalBreakMinutes ?? null,
        manualEditReason: entry.manualEditReason ?? '',
      });
    }
  }, [entry, reset]);

  const onSubmit = handleSubmit(async (values) => {
    if (!entry?.id) return;
    const id = entry.id;
    const result = await editEntry({
      input: {
        id,
        clockedInAt: fromLocalInput(values.clockedInAt),
        clockedOutAt: values.clockedOutAt
          ? fromLocalInput(values.clockedOutAt)
          : null,
        totalBreakMinutes: values.totalBreakMinutes ?? null,
        manualEditReason: values.manualEditReason,
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Time entry updated');
    onSaved();
  });

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit time entry</DialogTitle>
          <DialogDescription>
            Manual edits are recorded with your name and the reason. Use this
            to correct missed punches or wrong times.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <div className="grid gap-2">
            <Label htmlFor="te-edit-in">Clocked in</Label>
            <Input
              id="te-edit-in"
              type="datetime-local"
              {...register('clockedInAt')}
            />
            {formState.errors.clockedInAt ? (
              <p className="text-sm text-destructive">
                {formState.errors.clockedInAt.message}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="te-edit-out">Clocked out</Label>
            <Controller
              control={control}
              name="clockedOutAt"
              render={({ field }) => (
                <Input
                  id="te-edit-out"
                  type="datetime-local"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value || null)}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                />
              )}
            />
            {formState.errors.clockedOutAt ? (
              <p className="text-sm text-destructive">
                {formState.errors.clockedOutAt.message}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="te-edit-breaks">Break minutes</Label>
            <Controller
              control={control}
              name="totalBreakMinutes"
              render={({ field }) => (
                <Input
                  id="te-edit-breaks"
                  type="number"
                  min="0"
                  step="1"
                  value={field.value ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    field.onChange(v === '' ? null : Number(v));
                  }}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  name={field.name}
                />
              )}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="te-edit-reason">Reason</Label>
            <Input
              id="te-edit-reason"
              placeholder="Why are you editing this entry?"
              {...register('manualEditReason')}
            />
            {formState.errors.manualEditReason ? (
              <p className="text-sm text-destructive">
                {formState.errors.manualEditReason.message}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={fetching}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={fetching}>
              {fetching ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
