import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const markReadyMock = vi.fn(async () => ({
  data: { markTicketItemReady: { id: 'l-1', status: 'READY', readyAt: '2026-04-25T12:00:00Z' } },
}));

vi.mock('urql', () => ({
  useMutation: () => [{ fetching: false, error: undefined }, markReadyMock],
  useQuery: () => [{ data: undefined, fetching: false, error: undefined }, vi.fn()],
  useSubscription: () => [{ fetching: false, data: undefined, error: undefined }],
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  ItemCourse,
  OrderType,
  TicketItemStatus,
  type KitchenTicketsQuery,
} from '@/lib/graphql/generated/graphql';
import { KdsTicketCard, classifyAge, oldestUnreadyFiredAt } from './kds-ticket-card';

type Ticket = NonNullable<NonNullable<KitchenTicketsQuery['kitchenTickets']>[number]>;

const baseTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: 't-1',
  shortNumber: 42,
  customerLabel: 'Table 4',
  orderType: OrderType.DineIn,
  items: [],
  ...overrides,
});

const FIVE_MIN_AGO = '2026-04-25T11:55:00.000Z';
const SEVEN_MIN_AGO = '2026-04-25T11:53:00.000Z';
const TWELVE_MIN_AGO = '2026-04-25T11:48:00.000Z';
const NOW = new Date('2026-04-25T12:00:00.000Z').getTime();

describe('classifyAge', () => {
  it('returns default below 5 minutes', () => {
    expect(classifyAge(0)).toBe('default');
    expect(classifyAge(4 * 60_000)).toBe('default');
  });
  it('returns warning between 5 and 10 minutes', () => {
    expect(classifyAge(5 * 60_000)).toBe('warning');
    expect(classifyAge(9 * 60_000)).toBe('warning');
  });
  it('returns danger over 10 minutes', () => {
    expect(classifyAge(10 * 60_000)).toBe('danger');
    expect(classifyAge(60 * 60_000)).toBe('danger');
  });
});

describe('oldestUnreadyFiredAt', () => {
  it('ignores READY/SERVED/VOIDED items', () => {
    const items = [
      { id: 'a', status: TicketItemStatus.Ready, firedAt: TWELVE_MIN_AGO },
      { id: 'b', status: TicketItemStatus.Fired, firedAt: SEVEN_MIN_AGO },
      { id: 'c', status: TicketItemStatus.Served, firedAt: TWELVE_MIN_AGO },
    ];
    expect(oldestUnreadyFiredAt(items)).toBe(new Date(SEVEN_MIN_AGO).getTime());
  });

  it('returns null when no item is unready with a firedAt', () => {
    expect(
      oldestUnreadyFiredAt([{ id: 'a', status: TicketItemStatus.Ready, firedAt: SEVEN_MIN_AGO }]),
    ).toBeNull();
  });
});

describe('KdsTicketCard', () => {
  it('groups items by course', () => {
    const ticket = baseTicket({
      items: [
        {
          id: 'l-main',
          status: TicketItemStatus.Fired,
          nameSnapshot: 'Burger',
          quantity: 1,
          course: ItemCourse.Main,
          firedAt: SEVEN_MIN_AGO,
          readyAt: null,
          voidedAt: null,
          modifiers: [],
        },
        {
          id: 'l-app',
          status: TicketItemStatus.Fired,
          nameSnapshot: 'Salad',
          quantity: 2,
          course: ItemCourse.Appetizer,
          firedAt: SEVEN_MIN_AGO,
          readyAt: null,
          voidedAt: null,
          modifiers: [],
        },
        {
          id: 'l-bev',
          status: TicketItemStatus.Ready,
          nameSnapshot: 'Coke',
          quantity: 1,
          course: ItemCourse.Beverage,
          firedAt: SEVEN_MIN_AGO,
          readyAt: SEVEN_MIN_AGO,
          voidedAt: null,
          modifiers: [],
        },
      ],
    });
    render(<KdsTicketCard ticket={ticket} nowMs={NOW} />);
    // Course headers should both render.
    expect(screen.getByText('Appetizers')).toBeInTheDocument();
    expect(screen.getByText('Mains')).toBeInTheDocument();
    expect(screen.getByText('Burger')).toBeInTheDocument();
    expect(screen.getByText('Salad')).toBeInTheDocument();
    // READY items render as "Ready", not as a Bump button.
    expect(screen.getByText('✓ Ready')).toBeInTheDocument();
    // Bump buttons appear for each FIRED item (one per FIRED line).
    expect(screen.getAllByRole('button', { name: /bump/i })).toHaveLength(2);
  });

  it('clicking Bump triggers MarkTicketItemReady mutation', async () => {
    markReadyMock.mockClear();
    const ticket = baseTicket({
      items: [
        {
          id: 'l-1',
          status: TicketItemStatus.Fired,
          nameSnapshot: 'Burger',
          quantity: 1,
          course: ItemCourse.Main,
          firedAt: SEVEN_MIN_AGO,
          readyAt: null,
          voidedAt: null,
          modifiers: [],
        },
      ],
    });
    const user = userEvent.setup();
    render(<KdsTicketCard ticket={ticket} nowMs={NOW} />);
    await user.click(screen.getByRole('button', { name: /bump burger/i }));
    expect(markReadyMock).toHaveBeenCalledOnce();
    const call = (markReadyMock.mock.calls as unknown as Array<
      Array<{ input: { ticketItemId: string } }>
    >)[0]?.[0];
    expect(call?.input.ticketItemId).toBe('l-1');
  });

  it('tints the card variant by oldest-unready age threshold', () => {
    const cases: Array<{ firedAt: string; expected: string }> = [
      { firedAt: FIVE_MIN_AGO.replace('11:55:00', '11:58:00'), expected: 'default' }, // 2 min
      { firedAt: SEVEN_MIN_AGO, expected: 'warning' }, // 7 min
      { firedAt: TWELVE_MIN_AGO, expected: 'danger' }, // 12 min
    ];
    for (const { firedAt, expected } of cases) {
      const ticket = baseTicket({
        id: `t-${expected}`,
        items: [
          {
            id: `l-${expected}`,
            status: TicketItemStatus.Fired,
            nameSnapshot: 'Burger',
            quantity: 1,
            course: ItemCourse.Main,
            firedAt,
            readyAt: null,
            voidedAt: null,
            modifiers: [],
          },
        ],
      });
      const { unmount } = render(<KdsTicketCard ticket={ticket} nowMs={NOW} />);
      const card = screen.getByTestId(`kds-card-t-${expected}`);
      expect(card.getAttribute('data-variant')).toBe(expected);
      const badge = screen.getByTestId('kds-age-badge');
      expect(badge.getAttribute('data-variant')).toBe(expected);
      unmount();
    }
  });
});
