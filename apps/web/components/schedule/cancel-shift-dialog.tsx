'use client';

import { useState } from 'react';
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
import { toast } from 'sonner';
import {
  StaffCancelShiftDocument,
  type ScheduleForWeekQuery,
} from '@/lib/graphql/generated/graphql';

type Shift = NonNullable<NonNullable<ScheduleForWeekQuery['scheduleForWeek']>[number]>;

export interface CancelShiftDialogProps {
  shift: Shift | null;
  onClose: () => void;
  onCancelled: () => void;
}

export function CancelShiftDialog({
  shift,
  onClose,
  onCancelled,
}: CancelShiftDialogProps): React.JSX.Element {
  const [reason, setReason] = useState('');
  const [{ fetching }, cancelShift] = useMutation(StaffCancelShiftDocument);

  const onConfirm = async (): Promise<void> => {
    if (!shift?.id) return;
    const id = shift.id;
    const result = await cancelShift({
      input: { id, cancelReason: reason || null },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Shift cancelled');
    setReason('');
    onCancelled();
  };

  return (
    <Dialog
      open={shift !== null}
      onOpenChange={(o) => {
        if (!o) {
          setReason('');
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel shift?</DialogTitle>
          <DialogDescription>
            The shift remains visible on the schedule with a strikethrough so
            staff can see why their published shift went away. Optionally
            record a reason.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="cancel-reason">Reason</Label>
          <Input
            id="cancel-reason"
            placeholder="Optional"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={fetching}>
            Keep shift
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={fetching}>
            {fetching ? 'Cancelling…' : 'Cancel shift'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
