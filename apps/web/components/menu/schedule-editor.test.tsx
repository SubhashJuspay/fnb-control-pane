import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScheduleEditor, type Schedule } from '@repo/ui';

describe('ScheduleEditor', () => {
  it('opens with the "Always live" radio selected when value is always', () => {
    render(
      <ScheduleEditor
        open
        onOpenChange={() => {}}
        value={{ kind: 'always' }}
        onChange={() => {}}
      />,
    );
    const alwaysRadio = screen.getByRole('radio', { name: /always live/i });
    expect(alwaysRadio).toHaveAttribute('aria-checked', 'true');
  });

  it('switching to schedule mode adds a default window and saves it', () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ScheduleEditor
        open
        onOpenChange={onOpenChange}
        value={{ kind: 'always' }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: /^schedule$/i }));
    // Default window populates Mon–Fri 09:00 → 17:00.
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]![0] as Schedule;
    expect(arg.kind).toBe('weekly');
    if (arg.kind === 'weekly') {
      expect(arg.windows).toHaveLength(1);
      expect(arg.windows[0]!.start).toBe('09:00');
      expect(arg.windows[0]!.end).toBe('17:00');
      expect(arg.windows[0]!.days).toContain('MON');
    }
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('blocks save when in schedule mode with no windows', () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ScheduleEditor
        open
        onOpenChange={onOpenChange}
        value={{ kind: 'weekly', windows: [] }}
        onChange={onChange}
      />,
    );
    // Already in schedule mode with empty windows.
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onChange).not.toHaveBeenCalled();
    // The dialog should still be open and an error message should be shown.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
