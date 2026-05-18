'use client';

import { useEffect, useMemo } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from 'urql';
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
import {
  FloorTablesDocument,
  OpenTicketDocument,
  OrderType,
  TableState,
} from '@/lib/graphql/generated/graphql';

const emptyToUndef = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const formSchema = z
  .object({
    customerLabel: z.preprocess(emptyToUndef, openTicketSchema.shape.customerLabel),
    orderType: openTicketSchema.shape.orderType,
    tableId: z.preprocess(emptyToUndef, openTicketSchema.shape.tableId),
    skipTable: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.orderType === 'DINE_IN' && !val.skipTable && !val.tableId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tableId'],
        message: 'Pick a table — or check "No table yet" if seating is pending',
      });
    }
  });

type FormValues = z.infer<typeof formSchema>;

interface NewTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (ticketId: string) => void;
}

/**
 * Modal RHF form for the `openTicket` mutation. Collects label + order type
 * and — for DINE_IN — the table to bind the ticket to. The "No table yet"
 * escape hatch lets a server ring an order before the party is seated.
 */
export function NewTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: NewTicketDialogProps): React.JSX.Element {
  const [, openTicket] = useMutation(OpenTicketDocument);
  // Only fetch the floor when the dialog is open — keeps the network panel
  // quiet for staff who never open the modal.
  const [{ data: floorData, fetching: floorFetching }] = useQuery({
    query: FloorTablesDocument,
    pause: !open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      customerLabel: undefined,
      orderType: 'DINE_IN',
      tableId: undefined,
      skipTable: false,
    },
  });
  const { register, handleSubmit, reset, watch, setValue, formState } = form;
  const { errors, isSubmitting } = formState;
  const orderType = watch('orderType');
  const skipTable = watch('skipTable');
  const tableId = watch('tableId');

  // Reset every time the dialog opens so a stale label doesn't linger.
  useEffect(() => {
    if (open) {
      reset({
        customerLabel: undefined,
        orderType: 'DINE_IN',
        tableId: undefined,
        skipTable: false,
      });
    }
  }, [open, reset]);

  // Hard-clear tableId/skipTable when the user flips to TAKEOUT so the
  // submit doesn't carry a stale table binding.
  useEffect(() => {
    if (orderType === 'TAKEOUT') {
      setValue('tableId', undefined);
      setValue('skipTable', false);
    }
  }, [orderType, setValue]);

  // Open tables = active + not occupied + not in cleaning. We compute this
  // client-side from floorTables; the server enforces the same invariant
  // in openTicketBoundToTable, so a race only surfaces as a clean error.
  const availableTables = useMemo(() => {
    const rows = floorData?.floorTables ?? [];
    return rows
      .filter((t) => t?.id && t?.label && t.archivedAt == null)
      .filter((t) => t.state === TableState.Available)
      .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
  }, [floorData?.floorTables]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await openTicket({
      input: {
        customerLabel: values.customerLabel ?? null,
        orderType: values.orderType === 'TAKEOUT' ? OrderType.Takeout : OrderType.DineIn,
        tableId: values.skipTable ? null : (values.tableId ?? null),
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

  const showTablePicker = orderType === 'DINE_IN';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a new ticket</DialogTitle>
          <DialogDescription>
            Pick the table and add an optional label.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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

          {showTablePicker ? (
            <div className="grid gap-1.5">
              <Label htmlFor="new-ticket-table">Table</Label>
              <select
                id="new-ticket-table"
                disabled={skipTable || floorFetching}
                {...register('tableId')}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="new-ticket-table"
              >
                <option value="">
                  {floorFetching
                    ? 'Loading tables…'
                    : availableTables.length === 0
                      ? 'No tables available'
                      : 'Select a table…'}
                </option>
                {availableTables.map((t) => (
                  <option key={t.id ?? ''} value={t.id ?? ''}>
                    {t.label}
                    {t.section?.name ? ` · ${t.section.name}` : ''}
                    {t.capacity ? ` · seats ${t.capacity}` : ''}
                  </option>
                ))}
              </select>
              <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  {...register('skipTable')}
                  data-testid="new-ticket-skip-table"
                />
                No table yet — assign when seating
              </label>
              {errors.tableId ? (
                <p className="text-xs text-destructive">{errors.tableId.message}</p>
              ) : null}
              {!skipTable && availableTables.length === 0 && !floorFetching ? (
                <p className="text-xs text-muted-foreground">
                  Every table currently has an open ticket. Close one or check
                  &ldquo;No table yet&rdquo; to continue.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="new-ticket-label">Customer label (optional)</Label>
            <Input
              id="new-ticket-label"
              placeholder="e.g. Maria, party of 4"
              autoFocus
              {...register('customerLabel')}
            />
            {errors.customerLabel ? (
              <p className="text-xs text-destructive">{errors.customerLabel.message}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                (showTablePicker && !skipTable && !tableId)
              }
            >
              {isSubmitting ? 'Opening…' : 'Open ticket'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
