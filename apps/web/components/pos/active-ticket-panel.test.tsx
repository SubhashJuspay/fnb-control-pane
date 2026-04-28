import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockTicketAllServed = {
  ticket: {
    id: 't-1',
    shortNumber: 7,
    customerLabel: 'Table 4',
    orderType: 'DINE_IN',
    status: 'OPEN',
    subtotalCents: 1500,
    discountCents: 0,
    taxCents: 120,
    totalCents: 1620,
    openedAt: '2026-04-25T12:00:00.000Z',
    closedAt: null,
    voidedAt: null,
    voidReason: null,
    closeNote: null,
    openedBy: { id: 'u-1', name: 'Alex', email: 'alex@example.com' },
    items: [
      {
        id: 'l-1',
        status: 'SERVED',
        nameSnapshot: 'Burger',
        unitPriceCents: 1500,
        quantity: 1,
        modifiersTotalCents: 0,
        lineSubtotalCents: 1500,
        course: 'MAIN',
        notes: null,
        firedAt: '2026-04-25T12:05:00.000Z',
        readyAt: '2026-04-25T12:10:00.000Z',
        servedAt: '2026-04-25T12:11:00.000Z',
        voidedAt: null,
        voidReason: null,
        menuItem: { id: 'mi-1', imageUrl: null },
        modifiers: [],
        discounts: [],
        effectivePriceAfterDiscountsCents: 1500,
      },
    ],
    discounts: [],
  },
};

const mockTicketHasNew = {
  ...mockTicketAllServed,
  ticket: {
    ...mockTicketAllServed.ticket,
    items: [
      {
        ...mockTicketAllServed.ticket.items[0],
        status: 'NEW',
        firedAt: null,
        readyAt: null,
        servedAt: null,
      },
    ],
  },
};

const mockState = { data: mockTicketHasNew as unknown };

vi.mock('urql', () => ({
  useQuery: () => [
    { data: mockState.data, fetching: false, stale: false, error: undefined },
    vi.fn(),
  ],
  useMutation: () => [{ fetching: false, error: undefined }, vi.fn()],
  useSubscription: () => [{ fetching: false, data: undefined, error: undefined }],
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/location-currency', () => ({
  useLocationCurrency: () => 'USD',
}));

import { TicketItemStatus } from '@/lib/graphql/generated/graphql';
import { ActiveTicketPanel, canCloseTicket } from './active-ticket-panel';

describe('canCloseTicket', () => {
  it('returns true only when every item is SERVED or VOIDED', () => {
    expect(canCloseTicket([{ status: TicketItemStatus.Served }])).toBe(true);
    expect(
      canCloseTicket([{ status: TicketItemStatus.Served }, { status: TicketItemStatus.Voided }]),
    ).toBe(true);
    expect(
      canCloseTicket([{ status: TicketItemStatus.Served }, { status: TicketItemStatus.New }]),
    ).toBe(false);
    expect(canCloseTicket([{ status: TicketItemStatus.Fired }])).toBe(false);
    expect(canCloseTicket([{ status: TicketItemStatus.Ready }])).toBe(false);
    // Empty ticket → cannot close (no lines to close on).
    expect(canCloseTicket([])).toBe(false);
  });
});

describe('ActiveTicketPanel', () => {
  it('renders totals derived from the ticket query', () => {
    mockState.data = mockTicketAllServed;
    render(<ActiveTicketPanel ticketId="t-1" canManagerActions={false} />);
    expect(screen.getByText('#7')).toBeInTheDocument();
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    // Subtotal $15.00 appears both in the line and in the totals block.
    expect(screen.getAllByText('$15.00').length).toBeGreaterThanOrEqual(2);
    // Tax $1.20 and total $16.20 only appear in the totals block.
    expect(screen.getByText('$1.20')).toBeInTheDocument();
    expect(screen.getByText('$16.20')).toBeInTheDocument();
  });

  it('disables "Close ticket" while items are still NEW/FIRED/READY', () => {
    mockState.data = mockTicketHasNew;
    render(<ActiveTicketPanel ticketId="t-1" canManagerActions={false} />);
    const closeBtn = screen.getByRole('button', { name: /close ticket/i });
    expect(closeBtn).toBeDisabled();
  });

  it('enables "Close ticket" once all items are SERVED', () => {
    mockState.data = mockTicketAllServed;
    render(<ActiveTicketPanel ticketId="t-1" canManagerActions={false} />);
    const closeBtn = screen.getByRole('button', { name: /close ticket/i });
    expect(closeBtn).not.toBeDisabled();
  });
});
