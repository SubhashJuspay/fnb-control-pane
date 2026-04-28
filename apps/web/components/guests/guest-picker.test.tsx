import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const searchState: { rows: unknown[]; fetching: boolean } = {
  rows: [
    {
      id: 'g-1',
      name: 'Alice',
      phone: '555-0100',
      email: null,
      visitCount: 3,
      totalSpentCents: 4500,
    },
  ],
  fetching: false,
};

vi.mock('urql', () => ({
  useQuery: ({ pause }: { pause?: boolean }) => [
    {
      data: pause ? undefined : { searchGuests: searchState.rows },
      fetching: searchState.fetching,
      stale: false,
      error: undefined,
    },
    vi.fn(),
  ],
  useMutation: () => [{ fetching: false, error: undefined }, vi.fn()],
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { GuestPicker } from './guest-picker';

describe('GuestPicker', () => {
  it('renders matching rows when typing a query', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(
      <GuestPicker open onClose={() => {}} onPick={onPick} />,
    );
    const input = screen.getByLabelText(/search guests/i);
    await user.type(input, 'Ali');
    // Debounced 200ms; wait until the row renders.
    await waitFor(
      () => {
        expect(screen.getByText('Alice')).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
    await user.click(screen.getByText('Alice'));
    expect(onPick).toHaveBeenCalledWith({
      id: 'g-1',
      name: 'Alice',
      phone: '555-0100',
    });
  });

  it('shows the create-new affordance when there are no matches', async () => {
    searchState.rows = [];
    const user = userEvent.setup();
    render(
      <GuestPicker open onClose={() => {}} onPick={() => {}} />,
    );
    const input = screen.getByLabelText(/search guests/i);
    await user.type(input, 'Bob');
    await waitFor(
      () => {
        expect(
          screen.getByRole('button', {
            name: /create new guest with name "bob"/i,
          }),
        ).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
  });
});
