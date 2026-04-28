import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const applyTicketDiscountMock = vi.fn(async () => ({
  data: { applyTicketDiscount: { id: 'd-1' } },
}));
const applyLineDiscountMock = vi.fn(async () => ({
  data: { applyLineDiscount: { id: 'd-2' } },
}));

vi.mock('urql', () => ({
  useMutation: (doc: unknown) => {
    const name = typeof doc === 'object' && doc !== null && 'definitions' in doc
      ? (doc as { definitions: Array<{ name?: { value: string } }> }).definitions[0]?.name?.value
      : '';
    if (name === 'ApplyTicketDiscount') return [{ fetching: false, error: undefined }, applyTicketDiscountMock];
    if (name === 'ApplyLineDiscount') return [{ fetching: false, error: undefined }, applyLineDiscountMock];
    return [{ fetching: false, error: undefined }, vi.fn()];
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/location-currency', () => ({
  useLocationCurrency: () => 'USD',
}));

import { DiscountDialog, previewDiscountCents } from './discount-dialog';
import { DiscountKind } from '@/lib/graphql/generated/graphql';

describe('previewDiscountCents', () => {
  it('caps FLAT at the source amount', () => {
    expect(previewDiscountCents(DiscountKind.Flat, 1000, 1500, null)).toBe(1000);
    expect(previewDiscountCents(DiscountKind.Flat, 1000, 250, null)).toBe(250);
    expect(previewDiscountCents(DiscountKind.Flat, 1000, null, null)).toBe(0);
  });

  it('rounds PERCENT to the nearest cent', () => {
    expect(previewDiscountCents(DiscountKind.Percent, 1000, null, 10)).toBe(100);
    expect(previewDiscountCents(DiscountKind.Percent, 1234, null, 10)).toBe(123);
    expect(previewDiscountCents(DiscountKind.Percent, 1000, null, null)).toBe(0);
  });
});

describe('DiscountDialog', () => {
  it('blocks submit when FLAT amount is missing', async () => {
    applyTicketDiscountMock.mockClear();
    applyLineDiscountMock.mockClear();
    const user = userEvent.setup();
    render(
      <DiscountDialog
        open
        onOpenChange={vi.fn()}
        target={{ kind: 'ticket', ticketId: 't-1', sourceCents: 5000 }}
        onApplied={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/reason/i), 'Manager comp');
    await user.click(screen.getByRole('button', { name: /apply discount/i }));
    expect(applyTicketDiscountMock).not.toHaveBeenCalled();
  });

  it('calls applyTicketDiscount with cents + reason for FLAT', async () => {
    applyTicketDiscountMock.mockClear();
    applyLineDiscountMock.mockClear();
    const user = userEvent.setup();
    render(
      <DiscountDialog
        open
        onOpenChange={vi.fn()}
        target={{ kind: 'ticket', ticketId: 't-1', sourceCents: 5000 }}
        onApplied={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText(/^amount$/i), '5');
    await user.type(screen.getByLabelText(/reason/i), 'Manager comp');
    await user.click(screen.getByRole('button', { name: /apply discount/i }));
    expect(applyTicketDiscountMock).toHaveBeenCalledOnce();
    const call = (applyTicketDiscountMock.mock.calls as unknown as Array<
      Array<{ input: { ticketId: string; kind: string; amountCents: number | null; percentBp: number | null; reason: string } }>
    >)[0]?.[0];
    expect(call?.input.ticketId).toBe('t-1');
    expect(call?.input.kind).toBe('FLAT');
    expect(call?.input.amountCents).toBe(500);
    // Unused fields are omitted (not null) so the api's `.optional()` schema
    // accepts the input — caught by E2E.
    expect(call?.input.percentBp).toBeUndefined();
    expect(call?.input.reason).toBe('Manager comp');
    expect(applyLineDiscountMock).not.toHaveBeenCalled();
  });

  it('calls applyLineDiscount for line-target with PERCENT in basis points', async () => {
    applyTicketDiscountMock.mockClear();
    applyLineDiscountMock.mockClear();
    const user = userEvent.setup();
    render(
      <DiscountDialog
        open
        onOpenChange={vi.fn()}
        target={{ kind: 'line', ticketItemId: 'ti-9', sourceCents: 1000 }}
        onApplied={vi.fn()}
      />,
    );
    // Switch to PERCENT (radio).
    await user.click(screen.getByRole('radio', { name: /^percent$/i }));
    // The input gets a matching <Label htmlFor="discount-percent">.
    const percentInput = document.getElementById('discount-percent') as HTMLInputElement;
    await user.type(percentInput, '10');
    await user.type(screen.getByLabelText(/reason/i), 'Loyalty discount');
    await user.click(screen.getByRole('button', { name: /apply discount/i }));
    expect(applyLineDiscountMock).toHaveBeenCalledOnce();
    const call = (applyLineDiscountMock.mock.calls as unknown as Array<
      Array<{ input: { ticketItemId: string; kind: string; percentBp: number | null; amountCents: number | null; reason: string } }>
    >)[0]?.[0];
    expect(call?.input.ticketItemId).toBe('ti-9');
    expect(call?.input.kind).toBe('PERCENT');
    expect(call?.input.percentBp).toBe(1000);
    expect(call?.input.amountCents).toBeUndefined();
    expect(call?.input.reason).toBe('Loyalty discount');
    expect(applyTicketDiscountMock).not.toHaveBeenCalled();
  });
});
