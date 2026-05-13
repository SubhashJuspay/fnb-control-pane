'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from 'urql';
import { AlertTriangle, Clock4, Globe, StickyNote } from 'lucide-react';
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

  const [{ fetching: marking }, markReady] = useMutation(MarkTicketItemReadyDocument);
  const [bumpingId, setBumpingId] = useState<string | null>(null);

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
    if (bumpingId) return; // ignore re-clicks while a mutation is in flight
    setBumpingId(itemId);
    try {
      const result = await markReady({ input: { ticketItemId: itemId } });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      toast.success('Marked ready');
    } finally {
      setBumpingId(null);
    }
  };
  // urql shares a single fetching flag across concurrent mutations on the same
  // hook — we track per-line `bumpingId` so only the clicked Bump button shows
  // the pending state.
  void marking;

  return (
    <TicketCard
      variant={variant}
      data-testid={`kds-card-${ticket.id ?? ''}`}
      headerSlot={
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-bold">#{ticket.shortNumber ?? '—'}</span>
            <div className="flex items-center gap-1.5">
              {ticket.originChannel === 'ONLINE' ? (
                <span
                  className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800"
                  title="Online order"
                >
                  <Globe className="size-3" aria-hidden />
                  Online
                </span>
              ) : null}
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
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">
              {ticket.onlineRequest?.customerName ??
                ticket.customerLabel ??
                'No label'}
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
          {ticket.onlineRequest?.pickupAt ? (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock4 className="size-3" aria-hidden />
              Pickup{' '}
              {ticket.onlineRequest.pickupKind === 'ASAP' ? 'ASAP — ' : ''}
              {new Date(ticket.onlineRequest.pickupAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          ) : null}
          {ticket.onlineRequest?.notes ? (
            <div
              className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900"
              data-testid="kds-order-notes"
            >
              <StickyNote className="size-3 shrink-0" aria-hidden />
              <span>{ticket.onlineRequest.notes}</span>
            </div>
          ) : null}
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
                    pending={bumpingId === item.id}
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
  pending,
}: {
  item: KitchenTicketItem;
  onBump: (ticketItemId: string) => void;
  pending: boolean;
}): React.JSX.Element {
  // Group modifiers by their group name so chefs see "Size: Medium · Milk: Whole"
  // rather than a flat "Medium, Whole, Caramel" run-on.
  const modifierGroups = new Map<string, string[]>();
  for (const m of item.modifiers ?? []) {
    if (!m?.nameSnapshot) continue;
    const group = m.modifierGroupName ?? 'Modifiers';
    const list = modifierGroups.get(group) ?? [];
    list.push(m.nameSnapshot);
    modifierGroups.set(group, list);
  }
  const modifierEntries = Array.from(modifierGroups.entries());

  const allergens = (item.menuItem?.allergenTags ?? []).filter(
    (t): t is string => Boolean(t),
  );

  const isReady = item.status === TicketItemStatus.Ready;
  const isFired = item.status === TicketItemStatus.Fired;
  const isNew = item.status === TicketItemStatus.New;

  return (
    <li
      className="flex items-start justify-between gap-3 rounded-md border bg-background px-2.5 py-2"
      data-status={item.status ?? ''}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold tabular-nums">
            ×{item.quantity ?? 1}
          </span>
          <span className="text-sm font-semibold leading-tight">
            {item.nameSnapshot ?? '—'}
          </span>
        </div>
        {modifierEntries.length > 0 ? (
          <ul className="flex flex-col gap-0.5 text-xs">
            {modifierEntries.map(([group, names]) => (
              <li key={group}>
                <span className="text-muted-foreground">{group}:</span>{' '}
                <span className="font-medium">{names.join(', ')}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {item.notes ? (
          <p
            className="flex items-start gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-1 text-[11px] font-medium text-amber-900"
            data-testid="kds-item-notes"
          >
            <StickyNote className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>{item.notes}</span>
          </p>
        ) : null}
        {allergens.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            <AlertTriangle className="size-3 text-rose-700" aria-hidden />
            {allergens.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800"
                title={tag.replace(/^CONTAINS_/, 'Contains ').toLowerCase()}
              >
                {tag.replace(/^CONTAINS_/, '').replace('_', ' ').toLowerCase()}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        {isFired && item.id ? (
          <Button
            type="button"
            size="sm"
            onClick={() => onBump(item.id ?? '')}
            aria-label={`Bump ${item.nameSnapshot ?? 'item'}`}
            disabled={pending}
          >
            {pending ? 'Marking…' : 'Bump'}
          </Button>
        ) : isReady ? (
          <span className="text-xs font-semibold text-emerald-700">✓ Ready</span>
        ) : isNew ? (
          <span className="text-xs text-muted-foreground">Pending fire</span>
        ) : null}
      </div>
    </li>
  );
}
