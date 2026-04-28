import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const queryState = {
  data: undefined as unknown,
  fetching: false,
  error: undefined as Error | undefined,
};

vi.mock('urql', () => ({
  useQuery: () => [
    { data: queryState.data, fetching: queryState.fetching, error: queryState.error, stale: false },
    vi.fn(),
  ],
  useMutation: () => [{ fetching: false, error: undefined }, vi.fn()],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/acme/main/tickets',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/location-currency', () => ({
  useLocationCurrency: () => 'USD',
}));

import { TicketsTable } from './tickets-table';
import { OrderType, TicketStatus } from '@/lib/graphql/generated/graphql';

const initialFilters = {
  fromDate: '2026-04-25',
  toDate: '2026-04-25',
  status: 'ALL' as const,
  serverId: 'ALL' as const,
};

describe('TicketsTable', () => {
  it('shows the filter-panel empty state when there are no rows and no fetch in flight', () => {
    queryState.data = undefined;
    queryState.fetching = false;
    queryState.error = undefined;
    render(
      <TicketsTable
        tenantSlug="acme"
        locationSlug="main"
        servers={[]}
        initialFilters={initialFilters}
      />,
    );
    expect(screen.getByText(/no tickets in this range/i)).toBeInTheDocument();
  });

  it('shows a loading hint while the first page is fetching', () => {
    queryState.data = undefined;
    queryState.fetching = true;
    queryState.error = undefined;
    render(
      <TicketsTable
        tenantSlug="acme"
        locationSlug="main"
        servers={[]}
        initialFilters={initialFilters}
      />,
    );
    // While fetching with no rows yet, the filter panel still renders, but
    // the empty state is suppressed (since fetching is true).
    expect(screen.queryByText(/no tickets in this range/i)).not.toBeInTheDocument();
  });

  it('renders ticket rows from the query and shows totals + status', () => {
    queryState.fetching = false;
    queryState.error = undefined;
    queryState.data = {
      ticketHistory: {
        pageInfo: { hasNextPage: false, endCursor: null },
        edges: [
          {
            node: {
              id: 't-1',
              shortNumber: 7,
              customerLabel: 'Table 4',
              orderType: OrderType.DineIn,
              status: TicketStatus.Closed,
              subtotalCents: 1500,
              totalCents: 1620,
              openedAt: '2026-04-25T12:00:00.000Z',
              closedAt: '2026-04-25T12:30:00.000Z',
              businessDay: '2026-04-25T00:00:00.000Z',
              openedBy: { id: 'u-1', name: 'Alex' },
              items: [{ id: 'l-1', status: 'SERVED' }],
            },
          },
          {
            node: {
              id: 't-2',
              shortNumber: 9,
              customerLabel: null,
              orderType: OrderType.Takeout,
              status: TicketStatus.Voided,
              subtotalCents: 0,
              totalCents: 0,
              openedAt: '2026-04-25T13:00:00.000Z',
              closedAt: null,
              businessDay: '2026-04-25T00:00:00.000Z',
              openedBy: { id: 'u-2', name: 'Sam' },
              items: [],
            },
          },
        ],
      },
    };
    render(
      <TicketsTable
        tenantSlug="acme"
        locationSlug="main"
        servers={[]}
        initialFilters={initialFilters}
      />,
    );
    expect(screen.getByText('#7')).toBeInTheDocument();
    expect(screen.getByText('#9')).toBeInTheDocument();
    expect(screen.getByText('$16.20')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('Voided')).toBeInTheDocument();
    expect(screen.getByText(/2 tickets shown/i)).toBeInTheDocument();
  });
});
