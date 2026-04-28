'use client';

import { useEffect } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'urql';
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
import { toast } from 'sonner';
import { z } from 'zod';
import { voidTicketSchema } from '@repo/validation/ticket';
import { VoidTicketDocument } from '@/lib/graphql/generated/graphql';

const formSchema = z.object({
  voidReason: voidTicketSchema.shape.voidReason,
});

type FormValues = z.infer<typeof formSchema>;

interface VoidTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  ticketLabel: string;
  onVoided: () => void;
}

export function VoidTicketDialog({
  open,
  onOpenChange,
  ticketId,
  ticketLabel,
  onVoided,
}: VoidTicketDialogProps): React.JSX.Element {
  const [, voidTicket] = useMutation(VoidTicketDocument);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: { voidReason: '' },
  });
  const { register, handleSubmit, reset, formState } = form;
  const { errors, isSubmitting } = formState;

  useEffect(() => {
    if (open) reset({ voidReason: '' });
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await voidTicket({ input: { ticketId, voidReason: values.voidReason } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`Voided ${ticketLabel}`);
    onVoided();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void {ticketLabel}?</DialogTitle>
          <DialogDescription>
            Voids every line on the ticket and zeroes the totals. The ticket stays
            on file for the audit trail.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="void-ticket-reason">Reason</Label>
            <Input
              id="void-ticket-reason"
              autoFocus
              placeholder="Why are you voiding this ticket?"
              {...register('voidReason')}
            />
            {errors.voidReason ? (
              <p className="text-xs text-destructive">{errors.voidReason.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? 'Voiding…' : 'Void ticket'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
