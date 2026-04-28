import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const addTicketItemMock = vi.fn(async () => ({ data: { addTicketItem: { id: 'ti-1' } } }));
const setItemModifiersMock = vi.fn(async () => ({ data: { setTicketItemModifiers: { id: 'ti-1' } } }));

const mockCatalogItem = {
  catalogItem: {
    id: 'mi-1',
    name: 'Burger',
    basePriceCents: 1000,
    imageUrl: null,
    modifierGroups: [
      {
        id: 'g-1',
        name: 'Cheese',
        minSelections: 1,
        maxSelections: 1,
        modifiers: [
          { id: 'm-1', name: 'Cheddar', priceDeltaCents: 0, archivedAt: null, sortOrder: 0 },
          { id: 'm-2', name: 'Swiss', priceDeltaCents: 50, archivedAt: null, sortOrder: 1 },
        ],
      },
    ],
  },
};

vi.mock('urql', () => ({
  useQuery: () => [
    { data: mockCatalogItem, fetching: false, stale: false, error: undefined },
    vi.fn(),
  ],
  useMutation: (doc: unknown) => {
    const name = typeof doc === 'object' && doc !== null && 'definitions' in doc
      ? (doc as { definitions: Array<{ name?: { value: string } }> }).definitions[0]?.name?.value
      : '';
    if (name === 'AddTicketItem') return [{ fetching: false, error: undefined }, addTicketItemMock];
    if (name === 'SetTicketItemModifiers') return [{ fetching: false, error: undefined }, setItemModifiersMock];
    return [{ fetching: false, error: undefined }, vi.fn()];
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/location-currency', () => ({
  useLocationCurrency: () => 'USD',
}));

import { ModifierPicker, summarizeGroup } from './modifier-picker';

describe('summarizeGroup', () => {
  it('returns the right copy for the canonical cases', () => {
    expect(summarizeGroup(1, 1)).toBe('Required, exactly 1');
    expect(summarizeGroup(2, 2)).toBe('Required, exactly 2');
    expect(summarizeGroup(0, 1)).toBe('Optional, up to 1');
    expect(summarizeGroup(0, 3)).toBe('Optional, up to 3');
    expect(summarizeGroup(1, 3)).toBe('Required, 1–3');
  });
});

describe('ModifierPicker', () => {
  it('keeps the submit button disabled until a required-1 group has a selection', async () => {
    addTicketItemMock.mockClear();
    const user = userEvent.setup();
    render(
      <ModifierPicker
        open
        onOpenChange={vi.fn()}
        menuItemId="mi-1"
        mode={{ kind: 'add', ticketId: 't-1' }}
        onSubmitted={vi.fn()}
      />,
    );
    const submit = await screen.findByRole('button', { name: /add to ticket/i });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /cheddar/i }));
    expect(submit).not.toBeDisabled();
    await user.click(submit);
    expect(addTicketItemMock).toHaveBeenCalledOnce();
    const call = (addTicketItemMock.mock.calls as unknown as Array<
      Array<{ input: { ticketId: string; menuItemId: string; modifiers: Array<{ modifierId: string }> } }>
    >)[0]?.[0];
    expect(call?.input.ticketId).toBe('t-1');
    expect(call?.input.menuItemId).toBe('mi-1');
    expect(call?.input.modifiers).toEqual([{ modifierId: 'm-1' }]);
  });

  it('swaps the selection when picking a second modifier in a max=1 group', async () => {
    const user = userEvent.setup();
    render(
      <ModifierPicker
        open
        onOpenChange={vi.fn()}
        menuItemId="mi-1"
        mode={{ kind: 'add', ticketId: 't-1' }}
        onSubmitted={vi.fn()}
      />,
    );
    const cheddar = await screen.findByRole('checkbox', { name: /cheddar/i });
    const swiss = screen.getByRole('checkbox', { name: /swiss/i });
    await user.click(cheddar);
    expect(cheddar).toHaveAttribute('aria-checked', 'true');
    expect(swiss).toHaveAttribute('aria-checked', 'false');
    await user.click(swiss);
    expect(cheddar).toHaveAttribute('aria-checked', 'false');
    expect(swiss).toHaveAttribute('aria-checked', 'true');
  });
});
