import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('urql', () => ({
  useQuery: () => [
    {
      data: {
        catalogItems: {
          edges: [],
          pageInfo: { endCursor: null, hasNextPage: false },
          totalCount: 0,
        },
      },
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

import { ItemsTable } from './items-table';

describe('ItemsTable', () => {
  it('renders the empty state when there are no edges', () => {
    render(<ItemsTable tenantSlug="acme" />);
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
    // EmptyState plus the top "New item" button — both link to /new.
    const newLinks = screen.getAllByRole('link', { name: /new item/i });
    expect(newLinks.length).toBeGreaterThanOrEqual(1);
    expect(newLinks[0]).toHaveAttribute('href', '/acme/admin/catalog/items/new');
  });
});
