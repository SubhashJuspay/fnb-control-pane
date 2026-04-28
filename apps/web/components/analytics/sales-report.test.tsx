import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockSummary = {
  salesSummary: {
    fromDate: '2026-04-22T00:00:00.000Z',
    toDate: '2026-04-29T00:00:00.000Z',
    ticketCount: 12,
    closedTicketCount: 11,
    voidedTicketCount: 1,
    grossSalesCents: 60000,
    discountCents: 1000,
    taxCents: 4000,
    netSalesCents: 55000,
    averageTicketCents: 5000,
    uniqueGuests: 7,
  },
};

const mockHourly = {
  hourlyMix: [
    { hour: 11, ticketCount: 2, revenueCents: 1200 },
    { hour: 12, ticketCount: 4, revenueCents: 2400 },
  ],
};

vi.mock('urql', () => ({
  useQuery: ({ query }: { query: { definitions?: unknown[] } }) => {
    const def = query.definitions?.[0] as
      | { name?: { value?: string } }
      | undefined;
    const opName = def?.name?.value;
    if (opName === 'SalesSummary') {
      return [{ data: mockSummary, fetching: false, error: undefined }, vi.fn()];
    }
    if (opName === 'HourlyMix') {
      return [{ data: mockHourly, fetching: false, error: undefined }, vi.fn()];
    }
    return [{ data: undefined, fetching: false, error: undefined }, vi.fn()];
  },
  useMutation: () => [{ fetching: false, error: undefined }, vi.fn()],
}));

vi.mock('@/lib/location-currency', () => ({
  useLocationCurrency: () => 'USD',
}));

import { SalesReport } from './sales-report';

describe('SalesReport', () => {
  it('renders KPIs with seeded data', () => {
    render(<SalesReport />);
    // Net sales: $550.00 (55000 cents)
    expect(screen.getByText('$550.00')).toBeInTheDocument();
    // Closed tickets value
    expect(screen.getByTestId('kpi-tickets-value')).toHaveTextContent('11');
    // Avg ticket: $50.00
    expect(screen.getByTestId('kpi-avg-ticket-value')).toHaveTextContent(
      '$50.00',
    );
    // Unique guests
    expect(screen.getByTestId('kpi-unique-guests-value')).toHaveTextContent(
      '7',
    );
  });
});
