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
import { openTicketSchema } from '@repo/validation/ticket';
import { OpenTicketDocument, OrderType } from '@/lib/graphql/generated/graphql';

const emptyToUndef = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const formSchema = z.object({
  customerLabel: z.preprocess(emptyToUndef, openTicketSchema.shape.customerLabel),
  orderType: openTicketSchema.shape.orderType,
});

type FormValues = z.infer<typeof formSchema>;

interface NewTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ticketId: string) => void;
}

/**
 * Modal RHF form for the `openTicket` mutation. Exposes the two viewer-facing
 * fields the API allows on creation (customer label + order type) and hands
 * the new ticket id back so the workspace can immediately switch to it.
 */
export function NewTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: NewTicketDialogProps): React.JSX.Element {
  const [, openTicket] = useMutation(OpenTicketDocument);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      customerLabel: undefined,
      orderType: 'DINE_IN',
    },
  });
  const { register, handleSubmit, reset, formState } = form;
  const { errors, isSubmitting } = formState;

  // Reset every time the dialog opens so a stale label doesn't linger.
  useEffect(() => {
    if (open) reset({ customerLabel: undefined, orderType: 'DINE_IN' });
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await openTicket({
      input: {
        customerLabel: values.customerLabel ?? null,
        orderType: values.orderType === 'TAKEOUT' ? OrderType.Takeout : OrderType.DineIn,
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    const id = result.data?.openTicket?.id;
    if (!id) {
      toast.error('Could not open ticket');
      return;
    }
    toast.success('Ticket opened');
    onCreated(id);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a new ticket</DialogTitle>
          <DialogDescription>
            Add an optional label to help identify this order at a glance.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="new-ticket-label">Customer label (optional)</Label>
            <Input
              id="new-ticket-label"
              placeholder="e.g. Table 4, Maria"
              autoFocus
              {...register('customerLabel')}
            />
            {errors.customerLabel ? (
              <p className="text-xs text-destructive">{errors.customerLabel.message}</p>
            ) : null}
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Order type</legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" value="DINE_IN" {...register('orderType')} />
                Dine-in
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" value="TAKEOUT" {...register('orderType')} />
                Takeout
              </label>
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Opening…' : 'Open ticket'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
