'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'urql';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  formatMoney,
} from '@repo/ui';
import { MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import {
  FireTicketItemDocument,
  MarkTicketItemReadyDocument,
  MarkTicketItemServedDocument,
  TicketItemStatus,
  UpdateTicketItemDocument,
  type TicketQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';

type Ticket = NonNullable<TicketQuery['ticket']>;
type Line = NonNullable<NonNullable<Ticket['items']>[number]>;

interface LineRowProps {
  line: Line;
  onModifyModifiers: (line: Line) => void;
  onApplyDiscount: (line: Line) => void;
  onVoidLine: (line: Line) => void;
  onChanged: () => void;
}

const STATUS_LABEL: Record<TicketItemStatus, string> = {
  [TicketItemStatus.New]: 'New',
  [TicketItemStatus.Fired]: 'Fired',
  [TicketItemStatus.Ready]: 'Ready',
  [TicketItemStatus.Served]: 'Served',
  [TicketItemStatus.Voided]: 'Voided',
};

const STATUS_CLASS: Record<TicketItemStatus, string> = {
  [TicketItemStatus.New]: 'bg-blue-100 text-blue-900',
  [TicketItemStatus.Fired]: 'bg-amber-100 text-amber-900',
  [TicketItemStatus.Ready]: 'bg-emerald-100 text-emerald-900',
  [TicketItemStatus.Served]: 'bg-muted text-muted-foreground',
  [TicketItemStatus.Voided]: 'bg-destructive/10 text-destructive',
};

const QUANTITY_DEBOUNCE_MS = 600;

/**
 * Single ticket line. Renders quantity, name, modifier summary, line
 * subtotal, and a status pill, with a kebab menu for the available
 * transitions on the line's current status.
 */
export function LineRow({
  line,
  onModifyModifiers,
  onApplyDiscount,
  onVoidLine,
  onChanged,
}: LineRowProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [, updateLine] = useMutation(UpdateTicketItemDocument);
  const [, fireLine] = useMutation(FireTicketItemDocument);
  const [, markReady] = useMutation(MarkTicketItemReadyDocument);
  const [, markServed] = useMutation(MarkTicketItemServedDocument);

  const [editingQty, setEditingQty] = useState(false);
  const [draftQty, setDraftQty] = useState<number>(line.quantity ?? 1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset the draft if the canonical line quantity changes from the server.
  useEffect(() => {
    if (!editingQty) setDraftQty(line.quantity ?? 1);
  }, [line.quantity, editingQty]);

  const status = line.status ?? TicketItemStatus.New;
  const isVoided = status === TicketItemStatus.Voided;
  const isNew = status === TicketItemStatus.New;
  const isFired = status === TicketItemStatus.Fired;
  const isReady = status === TicketItemStatus.Ready;

  const onCommitQty = (next: number): void => {
    setDraftQty(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      debounceRef.current = null;
      if (!line.id) return;
      const result = await updateLine({
        input: { ticketItemId: line.id, quantity: Math.max(1, Math.min(99, next)) },
      });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      onChanged();
    }, QUANTITY_DEBOUNCE_MS);
  };

  const onFire = async (): Promise<void> => {
    if (!line.id) return;
    const result = await fireLine({ input: { ticketItemId: line.id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    onChanged();
  };

  const onMarkReady = async (): Promise<void> => {
    if (!line.id) return;
    const result = await markReady({ input: { ticketItemId: line.id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    onChanged();
  };

  const onMarkServed = async (): Promise<void> => {
    if (!line.id) return;
    const result = await markServed({ input: { ticketItemId: line.id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    onChanged();
  };

  const modifierSummary = (line.modifiers ?? [])
    .map((m) => m?.nameSnapshot)
    .filter((n): n is string => Boolean(n))
    .join(', ');

  return (
    <li
      data-testid={`line-row-${line.id ?? ''}`}
      data-status={status}
      className={`flex flex-col gap-1 border-b px-3 py-2 ${isVoided ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          {editingQty ? (
            <input
              type="number"
              min={1}
              max={99}
              autoFocus
              value={draftQty}
              onChange={(e) => onCommitQty(Number(e.target.value) || 1)}
              onBlur={() => setEditingQty(false)}
              className="h-7 w-14 rounded border bg-background px-1 text-sm tabular-nums"
              aria-label="Line quantity"
            />
          ) : (
            <button
              type="button"
              className="shrink-0 font-semibold tabular-nums hover:underline disabled:cursor-not-allowed disabled:no-underline"
              disabled={!isNew}
              onClick={() => isNew && setEditingQty(true)}
              aria-label={`Quantity ${line.quantity ?? 1}`}
            >
              {line.quantity ?? 1}×
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p
              className={`truncate text-sm font-medium ${isVoided ? 'line-through' : ''}`}
            >
              {line.nameSnapshot ?? '—'}
            </p>
            {modifierSummary ? (
              <p className="truncate text-xs text-muted-foreground">{modifierSummary}</p>
            ) : null}
            {line.notes ? (
              <p className="truncate text-xs italic text-muted-foreground">“{line.notes}”</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm tabular-nums">
            {formatMoney(line.lineSubtotalCents ?? 0, currency)}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CLASS[status]}`}
          >
            {STATUS_LABEL[status]}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Line actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isNew ? (
                <>
                  <DropdownMenuItem onSelect={() => setEditingQty(true)}>
                    Modify quantity
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onModifyModifiers(line)}>
                    Modify modifiers
                  </DropdownMenuItem>
                </>
              ) : null}
              {isNew ? (
                <DropdownMenuItem onSelect={onFire}>Fire line</DropdownMenuItem>
              ) : null}
              {isFired ? (
                <DropdownMenuItem onSelect={onMarkReady}>Mark ready</DropdownMenuItem>
              ) : null}
              {isReady ? (
                <DropdownMenuItem onSelect={onMarkServed}>Mark served</DropdownMenuItem>
              ) : null}
              {!isVoided ? (
                <DropdownMenuItem onSelect={() => onApplyDiscount(line)}>
                  Apply discount
                </DropdownMenuItem>
              ) : null}
              {!isVoided ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onVoidLine(line)}
                >
                  Void line
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {(line.discounts ?? []).filter((d) => d && !d.voidedAt).length > 0 ? (
        <ul className="ml-7 flex flex-col gap-0.5 text-xs text-muted-foreground">
          {(line.discounts ?? [])
            .filter((d): d is NonNullable<typeof d> => Boolean(d) && !d?.voidedAt)
            .map((d) => (
              <li key={d.id ?? ''} className="tabular-nums">
                Discount: {formatMoney(d.computedCents ?? 0, currency)}
                {d.reason ? ` — ${d.reason}` : ''}
              </li>
            ))}
        </ul>
      ) : null}
    </li>
  );
}
