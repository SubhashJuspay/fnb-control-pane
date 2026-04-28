'use client';

import { useEffect, useMemo } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
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
  MoneyInput,
  formatMoney,
} from '@repo/ui';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  ApplyLineDiscountDocument,
  ApplyTicketDiscountDocument,
  DiscountKind,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';

export type DiscountDialogTarget =
  | { kind: 'ticket'; ticketId: string; sourceCents: number }
  | { kind: 'line'; ticketItemId: string; sourceCents: number };

interface DiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: DiscountDialogTarget;
  onApplied: () => void;
}

/**
 * Form schema shared by both the ticket and line variants. We don't reuse
 * the validation-package schemas verbatim because the form holds the
 * percent in human form (e.g. `10` for 10%) and is converted to basis
 * points on submit; the package schemas already expect basis points. Cross-
 * field rules ("FLAT requires amountCents; PERCENT requires percent") are
 * enforced via `superRefine`.
 */
const formSchema = z
  .object({
    kind: z.enum(['FLAT', 'PERCENT']),
    amountCents: z.number().int().min(1).max(1_000_000).nullable().optional(),
    /** Form value is in human percent units (0.01–100). */
    percent: z.number().min(0.01).max(100).nullable().optional(),
    reason: z.string().trim().min(1, 'Reason is required').max(200),
  })
  .superRefine((d, ctx) => {
    if (d.kind === 'FLAT') {
      if (d.amountCents == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amountCents'],
          message: 'Amount is required',
        });
      }
    } else if (d.kind === 'PERCENT') {
      if (d.percent == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['percent'],
          message: 'Percent is required',
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

const COMMON_REASONS = [
  'Manager comp',
  'Wrong item',
  'Customer complaint',
  'Promotion',
  'Loyalty discount',
];

/**
 * Live preview of the cents that will be deducted. Mirrors the api's
 * computation: FLAT is capped to `sourceCents`; PERCENT rounds half-up.
 */
export function previewDiscountCents(
  kind: DiscountKind,
  sourceCents: number,
  amountCents: number | null | undefined,
  percent: number | null | undefined,
): number {
  if (kind === DiscountKind.Flat) {
    if (amountCents == null) return 0;
    return Math.max(0, Math.min(amountCents, sourceCents));
  }
  if (percent == null) return 0;
  return Math.max(0, Math.round((sourceCents * percent) / 100));
}

export function DiscountDialog({
  open,
  onOpenChange,
  target,
  onApplied,
}: DiscountDialogProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [, applyTicketDiscount] = useMutation(ApplyTicketDiscountDocument);
  const [, applyLineDiscount] = useMutation(ApplyLineDiscountDocument);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      kind: 'FLAT',
      amountCents: null,
      percent: null,
      reason: '',
    },
    mode: 'onSubmit',
  });
  const { register, handleSubmit, reset, control, watch, formState } = form;
  const { errors, isSubmitting } = formState;

  const kind = watch('kind');
  const amountCents = watch('amountCents');
  const percent = watch('percent');

  useEffect(() => {
    if (open) reset({ kind: 'FLAT', amountCents: null, percent: null, reason: '' });
  }, [open, reset, target]);

  const previewCents = useMemo(
    () =>
      previewDiscountCents(
        kind === 'PERCENT' ? DiscountKind.Percent : DiscountKind.Flat,
        target.sourceCents,
        amountCents,
        percent,
      ),
    [kind, target.sourceCents, amountCents, percent],
  );

  const datalistId = 'discount-reason-options';

  const onSubmit = handleSubmit(async (values) => {
    // The api `applyTicketDiscount` / `applyLineDiscount` validation schema
    // declares `amountCents` and `percentBp` as `.optional()` (i.e. allows
    // omission), not `.nullable()`. Sending `null` is rejected with
    // "Expected number, received null" — caught by E2E. Therefore omit the
    // field entirely when not used by the chosen discount kind.
    const baseInput: {
      kind: DiscountKind;
      reason: string;
      amountCents?: number;
      percentBp?: number;
    } = {
      kind: values.kind === 'PERCENT' ? DiscountKind.Percent : DiscountKind.Flat,
      reason: values.reason,
    };
    if (values.kind === 'FLAT' && values.amountCents != null) {
      baseInput.amountCents = values.amountCents;
    }
    if (values.kind === 'PERCENT' && values.percent != null) {
      // Convert human percent to basis points for the api.
      baseInput.percentBp = Math.round(values.percent * 100);
    }
    if (target.kind === 'ticket') {
      const result = await applyTicketDiscount({
        input: { ticketId: target.ticketId, ...baseInput },
      });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      toast.success('Discount applied');
      onApplied();
      return;
    }
    const result = await applyLineDiscount({
      input: { ticketItemId: target.ticketItemId, ...baseInput },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Discount applied');
    onApplied();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Apply {target.kind === 'ticket' ? 'ticket' : 'line'} discount
          </DialogTitle>
          <DialogDescription>
            Computed against {formatMoney(target.sourceCents, currency)} (
            {target.kind === 'ticket' ? 'ticket subtotal' : 'line subtotal'}).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Discount type</legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" value="FLAT" {...register('kind')} />
                Flat amount
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" value="PERCENT" {...register('kind')} />
                Percent
              </label>
            </div>
          </fieldset>

          {kind === 'FLAT' ? (
            <div className="grid gap-1.5">
              <Label htmlFor="discount-amount">Amount</Label>
              <Controller
                control={control}
                name="amountCents"
                render={({ field }) => (
                  <MoneyInput
                    id="discount-amount"
                    value={field.value ?? null}
                    onChange={field.onChange}
                    placeholder="0.00"
                    autoFocus
                  />
                )}
              />
              {errors.amountCents ? (
                <p className="text-xs text-destructive">{errors.amountCents.message}</p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="discount-percent">Percent</Label>
              <div className="flex items-center gap-2">
                <Controller
                  control={control}
                  name="percent"
                  render={({ field }) => (
                    <Input
                      id="discount-percent"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="100"
                      placeholder="10"
                      autoFocus
                      value={field.value ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        field.onChange(v === '' ? null : Number(v));
                      }}
                      className="w-32"
                    />
                  )}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              {errors.percent ? (
                <p className="text-xs text-destructive">{errors.percent.message}</p>
              ) : null}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="discount-reason">Reason</Label>
            <Input
              id="discount-reason"
              list={datalistId}
              placeholder="Manager comp"
              {...register('reason')}
            />
            <datalist id={datalistId}>
              {COMMON_REASONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            {errors.reason ? (
              <p className="text-xs text-destructive">{errors.reason.message}</p>
            ) : null}
          </div>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Computed discount:</span>{' '}
            <span className="font-semibold tabular-nums">
              -{formatMoney(previewCents, currency)}
            </span>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Applying…' : 'Apply discount'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
