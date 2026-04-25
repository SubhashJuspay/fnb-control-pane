import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignInForm } from './sign-in-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('./actions', () => ({
  signInAction: vi.fn(async () => ({ redirectTo: '/' })),
}));

describe('SignInForm', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows email validation error for invalid email', async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
  });

  it('calls server action with valid input', async () => {
    const user = userEvent.setup();
    const { signInAction } = await import('./actions');
    render(<SignInForm />);
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await vi.waitFor(() =>
      expect(signInAction).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          password: 'Password123!',
        }),
      ),
    );
  });
});
