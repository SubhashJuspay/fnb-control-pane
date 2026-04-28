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
import { voidTicketItemSchema } from '@repo/validation/ticket';
import { VoidTicketItemDocument } from '@/lib/graphql/generated/graphql';

const formSchema = z.object({
  voidReason: voidTicketItemSchema.shape.voidReason,
});

type FormValues = z.infer<typeof formSchema>;

interface VoidLineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketItemId: string;
  itemLabel: string;
  onVoided: () => void;
}

export function VoidLineDialog({
  open,
  onOpenChange,
  ticketItemId,
  itemLabel,
  onVoided,
}: VoidLineDialogProps): React.JSX.Element {
  const [, voidLine] = useMutation(VoidTicketItemDocument);
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
    const result = await voidLine({ input: { ticketItemId, voidReason: values.voidReason } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Line voided');
    onVoided();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void {itemLabel}?</DialogTitle>
          <DialogDescription>
            The line stays on the ticket for the audit trail but does not contribute
            to the totals.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="void-line-reason">Reason</Label>
            <Input
              id="void-line-reason"
              autoFocus
              placeholder="Why are you voiding this line?"
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
              {isSubmitting ? 'Voiding…' : 'Void line'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
