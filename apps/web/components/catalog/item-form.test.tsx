import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';

const createItemMock = vi.fn(async () => ({
  data: { createMenuItem: { id: 'new-item-id' } },
  error: undefined,
}));

vi.mock('urql', () => ({
  useMutation: () => [{ fetching: false, error: undefined }, createItemMock],
  useQuery: () => [
    {
      data: { catalogModifierGroups: { edges: [], pageInfo: { endCursor: null, hasNextPage: false }, totalCount: 0 } },
      fetching: false,
      stale: false,
      error: undefined,
    },
    vi.fn(),
  ],
}));

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
  usePathname: () => '/acme/admin/catalog/items/new',
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ItemForm } from './item-form';

const TAX_CATEGORIES = [{ id: '00000000-0000-4000-a000-000000000001', name: 'Food', kind: 'FOOD' }];
const CATEGORIES = [{ id: '00000000-0000-4000-a000-000000000010', name: 'Mains' }];

const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

function renderForm() {
  return render(
    <ItemForm
      mode="create"
      tenantSlug="acme"
      categories={CATEGORIES}
      taxCategories={TAX_CATEGORIES}
    />,
  );
}

describe('ItemForm', () => {
  it('blocks submission when name is empty', async () => {
    renderForm();
    const submit = screen.getByRole('button', { name: /create item/i });
    const form = submit.closest('form');
    if (!form) throw new Error('form not found');
    fireEvent.submit(form);
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/^name$/i);
      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    });
    expect(createItemMock).not.toHaveBeenCalled();
  });

  it('flags an invalid image URL', async () => {
    renderForm();
    await user.type(screen.getByLabelText(/^name$/i), 'Burger');
    await user.type(screen.getByLabelText(/image url/i), 'not-a-url');
    await user.selectOptions(screen.getByLabelText(/tax category/i), TAX_CATEGORIES[0]!.id);
    const submit = screen.getByRole('button', { name: /create item/i });
    const form = submit.closest('form');
    if (!form) throw new Error('form not found');
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByLabelText(/image url/i)).toHaveAttribute('aria-invalid', 'true');
    });
    expect(createItemMock).not.toHaveBeenCalled();
  });

  it('submits valid input and calls the create mutation', async () => {
    createItemMock.mockClear();
    renderForm();
    await user.type(screen.getByLabelText(/^name$/i), 'Burger');
    await user.selectOptions(screen.getByLabelText(/tax category/i), TAX_CATEGORIES[0]!.id);
    const priceInput = screen.getByLabelText(/base price/i);
    await user.clear(priceInput);
    await user.type(priceInput, '12.34');
    const submit = screen.getByRole('button', { name: /create item/i });
    const form = submit.closest('form');
    if (!form) throw new Error('form not found');
    fireEvent.submit(form);
    await waitFor(() => {
      expect(createItemMock).toHaveBeenCalledTimes(1);
    });
    const call = createItemMock.mock.calls[0] as unknown as [
      { input: { name: string; basePriceCents: number; taxCategoryId: string } },
    ];
    expect(call[0].input.name).toBe('Burger');
    expect(call[0].input.basePriceCents).toBe(1234);
    expect(call[0].input.taxCategoryId).toBe(TAX_CATEGORIES[0]!.id);
  });

  it('rejects negative prices via schema (basePrice cannot go below 0)', async () => {
    renderForm();
    await user.type(screen.getByLabelText(/^name$/i), 'Burger');
    await user.selectOptions(screen.getByLabelText(/tax category/i), TAX_CATEGORIES[0]!.id);
    // The zod schema enforces basePriceCents >= 0; force a negative value via the
    // hidden price input. MoneyInput accepts a leading '-' so we type into it.
    const priceInput = screen.getByLabelText(/base price/i) as HTMLInputElement;
    await user.clear(priceInput);
    fireEvent.change(priceInput, { target: { value: '-5.00' } });
    const submit = screen.getByRole('button', { name: /create item/i });
    const form = submit.closest('form');
    if (!form) throw new Error('form not found');
    fireEvent.submit(form);
    await waitFor(() => {
      expect(priceInput).toHaveAttribute('aria-invalid', 'true');
    });
  });
});
