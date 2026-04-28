import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockEmpty = {
  openTickets: [],
};

const mockWithTickets = {
  openTickets: [
    {
      id: 't1',
      shortNumber: 1,
      customerLabel: 'Table 4',
      orderType: 'DINE_IN',
      status: 'OPEN',
      subtotalCents: 2500,
      discountCents: 0,
      taxCents: 200,
      totalCents: 2700,
      openedAt: '2026-04-25T12:00:00.000Z',
      items: [
        { id: 'i1', status: 'NEW' },
        { id: 'i2', status: 'NEW' },
      ],
    },
    {
      id: 't2',
      shortNumber: 2,
      customerLabel: null,
      orderType: 'TAKEOUT',
      status: 'OPEN',
      subtotalCents: 1000,
      discountCents: 0,
      taxCents: 80,
      totalCents: 1080,
      openedAt: '2026-04-25T12:30:00.000Z',
      items: [{ id: 'i3', status: 'NEW' }],
    },
  ],
};

const mockState = { data: mockEmpty as unknown };

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

import { OpenTicketsSidebar } from './open-tickets-sidebar';

describe('OpenTicketsSidebar', () => {
  it('renders an empty state when there are no open tickets', () => {
    mockState.data = mockEmpty;
    render(<OpenTicketsSidebar activeTicketId={null} onSelectTicket={vi.fn()} />);
    expect(screen.getByText(/no open tickets/i)).toBeInTheDocument();
    expect(screen.getByText(/start by opening one/i)).toBeInTheDocument();
  });

  it('renders one row per open ticket with short number and total', () => {
    mockState.data = mockWithTickets;
    render(<OpenTicketsSidebar activeTicketId="t1" onSelectTicket={vi.fn()} />);
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Table 4')).toBeInTheDocument();
    // Totals are formatted to USD; both should render.
    expect(screen.getByText('$27.00')).toBeInTheDocument();
    expect(screen.getByText('$10.80')).toBeInTheDocument();
    // Active ticket should have aria-pressed=true.
    const t1Button = screen.getByRole('button', { name: /#1/ });
    expect(t1Button).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens the new-ticket dialog when "New ticket" is clicked', async () => {
    mockState.data = mockEmpty;
    const user = userEvent.setup();
    render(<OpenTicketsSidebar activeTicketId={null} onSelectTicket={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /new ticket/i }));
    expect(screen.getByRole('dialog', { name: /open a new ticket/i })).toBeInTheDocument();
  });
});
