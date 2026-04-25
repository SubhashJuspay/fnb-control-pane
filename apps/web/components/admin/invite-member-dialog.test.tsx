import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';

vi.mock('urql', () => ({
  useMutation: () => [
    { fetching: false, error: undefined },
    vi.fn(async () => ({ data: { inviteStaff: { id: 'i1' } } })),
  ],
  useQuery: () => [{ data: undefined, fetching: false, stale: false, error: undefined }, vi.fn()],
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { InviteMemberForm } from './invite-member-dialog';

const LOCATIONS = [
  { id: '00000000-0000-4000-a000-000000000001', name: 'Mission' },
  { id: '00000000-0000-4000-a000-000000000002', name: 'Castro' },
];

const user = userEvent.setup({
  pointerEventsCheck: PointerEventsCheckLevel.Never,
});

describe('InviteMemberForm', () => {
  it('disables the location field when role is OWNER', async () => {
    render(
      <InviteMemberForm
        locations={LOCATIONS}
        onSubmit={async () => {}}
        onCancel={() => {}}
        pending={false}
      />,
    );
    const roleSelect = screen.getByLabelText(/role/i) as HTMLSelectElement;
    await user.selectOptions(roleSelect, 'OWNER');
    const locationSelect = screen.getByLabelText(/location/i) as HTMLSelectElement;
    expect(locationSelect).toBeDisabled();
  });

  it('requires a location when role is STAFF', async () => {
    const onSubmit = vi.fn();
    render(
      <InviteMemberForm
        locations={LOCATIONS}
        onSubmit={onSubmit}
        onCancel={() => {}}
        pending={false}
      />,
    );
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'newhire@test.com');
    const roleSelect = screen.getByLabelText(/role/i) as HTMLSelectElement;
    await user.selectOptions(roleSelect, 'STAFF');
    const submit = screen.getByRole('button', { name: /send invite/i });
    const form = submit.closest('form');
    expect(form).not.toBeNull();
    if (form) fireEvent.submit(form);
    await waitFor(
      () => {
        const locationSelect = screen.getByLabelText(/location/i);
        expect(locationSelect).toHaveAttribute('aria-invalid', 'true');
      },
      { timeout: 3000 },
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
