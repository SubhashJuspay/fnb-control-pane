'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';

export interface DiscountDialogTarget {
  kind: 'ticket' | 'line';
  /** Discriminates `ticketId` vs `ticketItemId` from the consumer side. */
  ticketId?: string;
  ticketItemId?: string;
  /**
   * Subtotal in cents that the percent/flat discount will be computed
   * against. Used for the live preview.
   */
  sourceCents: number;
}

interface DiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DiscountDialogTarget;
  onApplied: () => void;
}

/**
 * Placeholder shell for the discount dialog. The full RHF + zodResolver
 * implementation lands in Task 17. This stub exists so the active ticket
 * panel can wire up the prop signature in Task 16 without circular work.
 */
export function DiscountDialog({
  open,
  onOpenChange,
  target,
}: DiscountDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply discount</DialogTitle>
          <DialogDescription>
            Discount UI ships in the next task. Target: {target.kind}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
