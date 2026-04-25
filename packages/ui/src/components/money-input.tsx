'use client';

import * as React from 'react';
import { Input } from './input.js';

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Current value in minor units (cents). `null` clears the field. */
  value: number | null;
  /** Called with the parsed minor-unit integer, or `null` if the field is empty. */
  onChange: (cents: number | null) => void;
  /**
   * Optional override of the displayed precision. Defaults to 2 (USD/EUR).
   * For zero-decimal currencies (JPY) pass 0; the component still emits the
   * integer minor-unit value, which for zero-decimal currencies equals the
   * raw amount.
   */
  fractionDigits?: number;
}

/**
 * Controlled money input. Stores the value as an integer number of cents but
 * displays "12.34"-style strings so callers don't have to parse on every
 * keystroke. Locally maintains the in-flight string so users can type "12."
 * without the value snapping back.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, fractionDigits = 2, onBlur, ...rest }, ref) => {
    const factor = 10 ** fractionDigits;
    const [draft, setDraft] = React.useState<string>(() =>
      value === null || Number.isNaN(value) ? '' : (value / factor).toFixed(fractionDigits),
    );

    // Sync from external updates (form reset, server refetch). Skip if the
    // displayed value, when parsed back, already equals the incoming cents —
    // that means we're echoing our own emit and shouldn't clobber the draft.
    React.useEffect(() => {
      const parsed = parseDraft(draft, factor);
      if (parsed === value) return;
      setDraft(value === null ? '' : (value / factor).toFixed(fractionDigits));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          // Allow only digits, optional single dot, optional leading '-' for
          // future delta-input reuse.
          if (next !== '' && !/^-?\d*\.?\d*$/.test(next)) return;
          setDraft(next);
          if (next === '' || next === '-' || next === '.' || next === '-.') {
            onChange(null);
            return;
          }
          const cents = parseDraft(next, factor);
          onChange(cents);
        }}
        onBlur={(e) => {
          // Re-format on blur so an incomplete "12." snaps to "12.00".
          if (draft !== '' && draft !== '-') {
            const cents = parseDraft(draft, factor);
            if (cents !== null) {
              setDraft((cents / factor).toFixed(fractionDigits));
            }
          }
          onBlur?.(e);
        }}
        {...rest}
      />
    );
  },
);
MoneyInput.displayName = 'MoneyInput';

function parseDraft(draft: string, factor: number): number | null {
  if (draft === '' || draft === '-' || draft === '.' || draft === '-.') return null;
  const num = Number(draft);
  if (Number.isNaN(num)) return null;
  // Round to the nearest minor unit to avoid float drift (e.g. 0.1 + 0.2).
  return Math.round(num * factor);
}
