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
  Label,
} from '@repo/ui';
import { toast } from 'sonner';
import { z } from 'zod';
import { closeTicketSchema } from '@repo/validation/ticket';
import { CloseTicketDocument } from '@/lib/graphql/generated/graphql';

const emptyToUndef = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const formSchema = z.object({
  closeNote: z.preprocess(emptyToUndef, closeTicketSchema.shape.closeNote),
});

type FormValues = z.infer<typeof formSchema>;

interface CloseTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  ticketLabel: string;
  onClosed: () => void;
}

export function CloseTicketDialog({
  open,
  onOpenChange,
  ticketId,
  ticketLabel,
  onClosed,
}: CloseTicketDialogProps): React.JSX.Element {
  const [, closeTicket] = useMutation(CloseTicketDocument);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: { closeNote: undefined },
  });
  const { register, handleSubmit, reset, formState } = form;
  const { errors, isSubmitting } = formState;

  useEffect(() => {
    if (open) reset({ closeNote: undefined });
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await closeTicket({
      input: { ticketId, closeNote: values.closeNote ?? null },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`Closed ${ticketLabel}`);
    onClosed();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close {ticketLabel}</DialogTitle>
          <DialogDescription>
            Closing finalizes the totals. You can still reopen the ticket later if
            needed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="close-ticket-note">Close note (optional)</Label>
            <textarea
              id="close-ticket-note"
              rows={3}
              placeholder="Optional context for the audit log"
              className="rounded-md border bg-background px-3 py-2 text-sm"
              {...register('closeNote')}
            />
            {errors.closeNote ? (
              <p className="text-xs text-destructive">{errors.closeNote.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Closing…' : 'Close ticket'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
