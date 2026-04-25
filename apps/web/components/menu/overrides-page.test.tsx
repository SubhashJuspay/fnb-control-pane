import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockData = {
  catalogItems: {
    edges: [
      {
        cursor: 'a',
        node: {
          id: 'item-a',
          name: 'Margherita',
          basePriceCents: 1500,
          imageUrl: null,
          // 86'd at this location.
          locationOverride: {
            id: 'lo-a',
            menuItemId: 'item-a',
            priceCents: null,
            available: false,
            hidden: false,
          },
        },
      },
      {
        cursor: 'b',
        node: {
          id: 'item-b',
          name: 'House Salad',
          basePriceCents: 1200,
          imageUrl: null,
          // Price-only override.
          locationOverride: {
            id: 'lo-b',
            menuItemId: 'item-b',
            priceCents: 1300,
            available: true,
            hidden: false,
          },
        },
      },
      {
        cursor: 'c',
        node: {
          id: 'item-c',
          name: 'Soda',
          basePriceCents: 300,
          imageUrl: null,
          locationOverride: null,
        },
      },
    ],
    pageInfo: { endCursor: null, hasNextPage: false },
    totalCount: 3,
  },
};

vi.mock('urql', () => ({
  useQuery: () => [
    {
      data: mockData,
      fetching: false,
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

vi.mock('@/lib/location-currency', () => ({
  useLocationCurrency: () => 'USD',
}));

import { OverridesPage } from './overrides-page';

describe('OverridesPage', () => {
  it('separates 86 board items from non-trivial overrides', () => {
    render(<OverridesPage />);
    // 86 board: Margherita is 86'd and gets a "Mark available" button.
    expect(screen.getByText('Margherita')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark available/i })).toBeInTheDocument();

    // Overrides table: House Salad (price-only override) is shown,
    // Margherita is NOT duplicated here (lives in 86 board), and Soda
    // (no override at all) is also absent.
    expect(screen.getByText('House Salad')).toBeInTheDocument();
    expect(screen.queryByText('Soda')).not.toBeInTheDocument();

    // Margherita should appear exactly once (in the 86 board).
    expect(screen.getAllByText('Margherita')).toHaveLength(1);
  });
});
