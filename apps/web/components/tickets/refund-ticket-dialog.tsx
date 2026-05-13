'use client';

import { useEffect, useState } from 'react';
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
  formatMoney,
} from '@repo/ui';
import { toast } from 'sonner';
import { RefundTicketDocument } from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';

export interface RefundTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  ticketLabel: string;
  /** Total + tip (the cap). */
  refundableCents: number;
  alreadyRefundedCents: number;
  onRefunded: () => void;
}

export function RefundTicketDialog({
  open,
  onOpenChange,
  ticketId,
  ticketLabel,
  refundableCents,
  alreadyRefundedCents,
  onRefunded,
}: RefundTicketDialogProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const remaining = Math.max(0, refundableCents - alreadyRefundedCents);
  const [, refund] = useMutation(RefundTicketDocument);

  const [amountDollars, setAmountDollars] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAmountDollars((remaining / 100).toFixed(2));
      setReason('');
      setSubmitting(false);
    }
  }, [open, remaining]);

  const amountCents = (() => {
    const n = Number.parseFloat(amountDollars);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  })();
  const overCap = amountCents > remaining;
  const reasonValid = reason.trim().length >= 2;
  const canSubmit = amountCents > 0 && !overCap && reasonValid && !submitting;

  const onSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    const result = await refund({
      input: { ticketId, amountCents, reason: reason.trim() },
    });
    setSubmitting(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`Refunded ${formatMoney(amountCents, currency)} on ${ticketLabel}`);
    onRefunded();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund {ticketLabel}</DialogTitle>
          <DialogDescription>
            Issue a partial or full refund. The amount is recorded against the
            ticket; payment-side reconciliation is handled outside the system.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Total + tip</dt>
            <dd className="text-right tabular-nums">
              {formatMoney(refundableCents, currency)}
            </dd>
            <dt className="text-muted-foreground">Already refunded</dt>
            <dd className="text-right tabular-nums">
              {formatMoney(alreadyRefundedCents, currency)}
            </dd>
            <dt className="font-semibold">Remaining</dt>
            <dd className="text-right font-semibold tabular-nums">
              {formatMoney(remaining, currency)}
            </dd>
          </dl>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-amount">Refund amount ({currency})</Label>
            <input
              id="refund-amount"
              data-testid="refund-amount"
              type="text"
              inputMode="decimal"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            />
            {overCap ? (
              <p className="text-xs text-destructive">
                Exceeds remaining refundable amount.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-reason">Reason</Label>
            <textarea
              id="refund-reason"
              data-testid="refund-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Item out of stock, wrong order, customer dissatisfied"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} data-testid="refund-submit">
              {submitting
                ? 'Refunding…'
                : `Refund ${formatMoney(amountCents, currency)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
