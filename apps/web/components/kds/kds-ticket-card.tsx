'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from 'urql';
import { Button, TicketCard, type TicketCardVariant } from '@repo/ui';
import { toast } from 'sonner';
import {
  ItemCourse,
  MarkTicketItemReadyDocument,
  OrderType,
  TicketItemStatus,
  type KitchenTicketsQuery,
} from '@/lib/graphql/generated/graphql';

type KitchenTicket = NonNullable<NonNullable<KitchenTicketsQuery['kitchenTickets']>[number]>;
type KitchenTicketItem = NonNullable<NonNullable<KitchenTicket['items']>[number]>;

const COURSE_ORDER: ItemCourse[] = [
  ItemCourse.Appetizer,
  ItemCourse.Main,
  ItemCourse.Side,
  ItemCourse.Dessert,
  ItemCourse.Beverage,
  ItemCourse.Other,
];

const COURSE_LABEL: Record<ItemCourse, string> = {
  [ItemCourse.Appetizer]: 'Appetizers',
  [ItemCourse.Main]: 'Mains',
  [ItemCourse.Side]: 'Sides',
  [ItemCourse.Dessert]: 'Desserts',
  [ItemCourse.Beverage]: 'Beverages',
  [ItemCourse.Other]: 'Other',
};

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  [OrderType.DineIn]: 'Dine-in',
  [OrderType.Takeout]: 'Takeout',
};

interface KdsTicketCardProps {
  ticket: KitchenTicket;
  /**
   * Optional override for "now" — used by tests to simulate the auto-tick
   * that production uses (`setInterval` updates state every 15s).
   */
  nowMs?: number;
}

/** Public for tests: classify the time-since-fire into a card variant. */
export function classifyAge(ageMs: number): TicketCardVariant {
  const minutes = ageMs / 60_000;
  if (minutes < 5) return 'default';
  if (minutes < 10) return 'warning';
  return 'danger';
}

/** Public for tests: pick the oldest unready item's `firedAt`. */
export function oldestUnreadyFiredAt(items: ReadonlyArray<KitchenTicketItem>): number | null {
  let oldest: number | null = null;
  for (const item of items) {
    if (
      item.status === TicketItemStatus.Served ||
      item.status === TicketItemStatus.Voided ||
      item.status === TicketItemStatus.Ready
    ) {
      continue;
    }
    if (!item.firedAt) continue;
    const t = new Date(item.firedAt).getTime();
    if (Number.isFinite(t) && (oldest === null || t < oldest)) oldest = t;
  }
  return oldest;
}

function formatDuration(ms: number): string {
  if (ms < 0) return '0m';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Single KDS card. Renders the order header, course-grouped item rows, and
 * an inline "Bump" action for every FIRED line. Tints its top border based
 * on how long the oldest unready item has been firing — green/yellow/red
 * thresholds that re-tick every 15 seconds without re-querying.
 */
export function KdsTicketCard({
  ticket,
  nowMs,
}: KdsTicketCardProps): React.JSX.Element {
  const [internalNow, setInternalNow] = useState<number>(() => Date.now());
  // 15-second tick so age + variant stay current even if no event arrives.
  useEffect(() => {
    if (nowMs !== undefined) return;
    const id = setInterval(() => setInternalNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [nowMs]);
  const now = nowMs ?? internalNow;

  const [, markReady] = useMutation(MarkTicketItemReadyDocument);

  const items: KitchenTicketItem[] = useMemo(
    () => (ticket.items ?? []).filter((i): i is KitchenTicketItem => Boolean(i?.id)),
    [ticket.items],
  );

  const visibleItems = items.filter(
    (i) => i.status !== TicketItemStatus.Served && i.status !== TicketItemStatus.Voided,
  );

  const oldestFiredAt = oldestUnreadyFiredAt(visibleItems);
  const ageMs = oldestFiredAt === null ? 0 : Math.max(0, now - oldestFiredAt);
  const variant = oldestFiredAt === null ? 'default' : classifyAge(ageMs);

  const grouped = useMemo(() => {
    const map = new Map<ItemCourse, KitchenTicketItem[]>();
    for (const item of visibleItems) {
      const course = item.course ?? ItemCourse.Other;
      const list = map.get(course) ?? [];
      list.push(item);
      map.set(course, list);
    }
    return COURSE_ORDER.flatMap((course) => {
      const list = map.get(course);
      return list && list.length > 0 ? [{ course, items: list }] : [];
    });
  }, [visibleItems]);

  const orderTypeLabel = ticket.orderType ? ORDER_TYPE_LABEL[ticket.orderType] : '—';
  const isTakeout = ticket.orderType === OrderType.Takeout;

  const onBump = async (itemId: string): Promise<void> => {
    const result = await markReady({ input: { ticketItemId: itemId } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Marked ready');
  };

  return (
    <TicketCard
      variant={variant}
      data-testid={`kds-card-${ticket.id ?? ''}`}
      headerSlot={
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-bold">#{ticket.shortNumber ?? '—'}</span>
            <span
              className={[
                'rounded-full px-2 py-0.5 text-xs font-semibold',
                isTakeout
                  ? 'bg-orange-100 text-orange-800'
                  : 'bg-secondary text-secondary-foreground',
              ].join(' ')}
            >
              {orderTypeLabel}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-muted-foreground">
              {ticket.customerLabel ?? 'No label'}
            </span>
            {oldestFiredAt !== null ? (
              <span
                data-testid="kds-age-badge"
                data-variant={variant}
                className={[
                  'rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                  variant === 'default'
                    ? 'bg-emerald-100 text-emerald-800'
                    : variant === 'warning'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-red-100 text-red-900',
                ].join(' ')}
              >
                {formatDuration(ageMs)}
              </span>
            ) : null}
          </div>
        </div>
      }
    >
      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">All items ready.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {grouped.map(({ course, items: courseItems }) => (
            <li key={course} className="flex flex-col gap-1.5" data-course={course}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {COURSE_LABEL[course]}
              </p>
              <ul className="flex flex-col gap-2">
                {courseItems.map((item) => (
                  <KdsItemRow
                    key={item.id ?? ''}
                    item={item}
                    onBump={(id) => onBump(id)}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </TicketCard>
  );
}

function KdsItemRow({
  item,
  onBump,
}: {
  item: KitchenTicketItem;
  onBump: (ticketItemId: string) => void;
}): React.JSX.Element {
  const modifierLine = (item.modifiers ?? [])
    .map((m) => m?.nameSnapshot)
    .filter((n): n is string => Boolean(n))
    .join(', ');
  const isReady = item.status === TicketItemStatus.Ready;
  const isFired = item.status === TicketItemStatus.Fired;
  const isNew = item.status === TicketItemStatus.New;

  return (
    <li className="flex items-start justify-between gap-3" data-status={item.status ?? ''}>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tabular-nums">×{item.quantity ?? 1}</span>
          <span className="truncate text-sm font-medium">{item.nameSnapshot ?? '—'}</span>
        </div>
        {modifierLine ? (
          <span className="truncate text-xs text-muted-foreground">{modifierLine}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        {isFired && item.id ? (
          <Button
            type="button"
            size="sm"
            onClick={() => onBump(item.id ?? '')}
            aria-label={`Bump ${item.nameSnapshot ?? 'item'}`}
          >
            Bump
          </Button>
        ) : isReady ? (
          <span className="text-xs font-medium text-emerald-700">✓ Ready</span>
        ) : isNew ? (
          <span className="text-xs text-muted-foreground">Pending fire</span>
        ) : null}
      </div>
    </li>
  );
}
