import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuestForm } from './guest-form';

describe('GuestForm', () => {
  it('refuses to submit when name is empty', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<GuestForm mode="create" onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /create guest/i }));
    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<GuestForm mode="create" onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/^name/i), 'Alice');
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /create guest/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits trimmed values with empty optionals coerced to null', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<GuestForm mode="create" onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/^name/i), '  Alice ');
    await user.type(screen.getByLabelText(/phone/i), ' 555-0100 ');
    await user.click(screen.getByRole('button', { name: /create guest/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Alice',
      phone: '555-0100',
      email: null,
      notes: null,
    });
  });

  it('threads guestId through update mode', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <GuestForm
        mode="update"
        guestId="11111111-1111-1111-1111-111111111111"
        initial={{ name: 'Alice' }}
      onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith({
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Alice',
      phone: null,
      email: null,
      notes: null,
    });
  });
});
