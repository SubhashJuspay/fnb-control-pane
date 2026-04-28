'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'urql';
import { toast } from 'sonner';
import { z } from 'zod';
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
import { CreateReservationDocument } from '@/lib/graphql/generated/graphql';
import { GuestPicker } from '@/components/guests/guest-picker';

// Form-level Zod schema. We coerce partySize/durationMinutes from <input
// type="number"> string values, and parse requestedTime from the datetime-
// local input. Mirrors createReservationSchema.
const formSchema = z.object({
  guestName: z.string().trim().min(1, 'Required').max(120),
  guestPhone: z.string().trim().max(40).optional(),
  partySize: z.coerce.number().int().min(1).max(40),
  requestedTime: z.string().min(1, 'Required'),
  durationMinutes: z.coerce.number().int().min(15).max(720).default(90),
  notes: z.string().trim().max(500).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface NewReservationDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewReservationDialog({
  open,
  onClose,
  onCreated,
}: NewReservationDialogProps): React.JSX.Element {
  const [, createReservation] = useMutation(CreateReservationDocument);
  const [pickedGuest, setPickedGuest] = useState<{
    id: string;
    name: string;
    phone: string | null;
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { durationMinutes: 90, partySize: 2 },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await createReservation({
      input: {
        guestName: values.guestName,
        guestPhone: values.guestPhone || null,
        partySize: values.partySize,
        requestedTime: new Date(values.requestedTime).toISOString(),
        durationMinutes: values.durationMinutes,
        guestId: pickedGuest?.id ?? null,
        notes: values.notes || null,
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    reset();
    setPickedGuest(null);
    onCreated();
  });

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New reservation</DialogTitle>
          <DialogDescription>
            Add a reservation for a future date and time.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Guest (optional)</Label>
            <div
              className="flex items-center gap-2"
              data-testid="reservation-guest-row"
            >
              {pickedGuest ? (
                <>
                  <span className="text-sm font-medium">
                    {pickedGuest.name}
                  </span>
                  {pickedGuest.phone ? (
                    <span className="text-xs text-muted-foreground">
                      {pickedGuest.phone}
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setPickedGuest(null)}
                  >
                    Clear
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPickerOpen(true)}
                  data-action="pick-guest"
                >
                  Pick guest
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="guestName">Guest name</Label>
            <Input
              id="guestName"
              {...register('guestName')}
              data-input="guestName"
            />
            {errors.guestName ? (
              <p className="text-xs text-destructive">{errors.guestName.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="guestPhone">Guest phone (optional)</Label>
            <Input
              id="guestPhone"
              {...register('guestPhone')}
              data-input="guestPhone"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="partySize">Party size</Label>
              <Input
                id="partySize"
                type="number"
                min={1}
                max={40}
                {...register('partySize')}
                data-input="partySize"
              />
              {errors.partySize ? (
                <p className="text-xs text-destructive">
                  {errors.partySize.message}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="durationMinutes">Duration (min)</Label>
              <Input
                id="durationMinutes"
                type="number"
                min={15}
                max={720}
                {...register('durationMinutes')}
                data-input="durationMinutes"
              />
              {errors.durationMinutes ? (
                <p className="text-xs text-destructive">
                  {errors.durationMinutes.message}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="requestedTime">Requested time</Label>
            <Input
              id="requestedTime"
              type="datetime-local"
              {...register('requestedTime')}
              data-input="requestedTime"
            />
            {errors.requestedTime ? (
              <p className="text-xs text-destructive">
                {errors.requestedTime.message}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" {...register('notes')} data-input="notes" />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} data-action="create">
              Create reservation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <GuestPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(g) => {
          setPickedGuest(g);
          setPickerOpen(false);
          // Pre-fill the (still-required) name + phone fields so the form
          // submits cleanly. The user may still override either.
          setValue('guestName', g.name);
          if (g.phone) setValue('guestPhone', g.phone);
        }}
      />
    </Dialog>
  );
}
