import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarChart } from '@repo/ui';

// recharts' ResponsiveContainer falls back to width:0 in jsdom which
// suppresses rendering of the inner SVG; we assert on the test wrapper
// `<div data-testid>` so the smoke test is still meaningful.
describe('BarChart', () => {
  it('renders the test wrapper for the given data', () => {
    render(
      <BarChart
        data={[
          { label: 'A', value: 1 },
          { label: 'B', value: 2 },
        ]}
        testId="smoke-bars"
      />,
    );
    expect(screen.getByTestId('smoke-bars')).toBeInTheDocument();
  });

  it('renders an empty wrapper when data is empty', () => {
    render(<BarChart data={[]} testId="empty-bars" />);
    expect(screen.getByTestId('empty-bars')).toBeInTheDocument();
  });
});
