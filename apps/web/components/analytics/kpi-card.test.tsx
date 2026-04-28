import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from '@repo/ui';

describe('KpiCard', () => {
  it('renders the label and primary value', () => {
    render(<KpiCard label="Net sales" value="$487" testId="kpi-net" />);
    expect(screen.getByText('Net sales')).toBeInTheDocument();
    expect(screen.getByText('$487')).toBeInTheDocument();
    const tile = screen.getByTestId('kpi-net');
    expect(tile).toBeInTheDocument();
  });

  it('renders the optional sub-value', () => {
    render(
      <KpiCard
        label="Tickets"
        value={12}
        subValue="2 voided"
        testId="kpi-tickets"
      />,
    );
    expect(screen.getByText('2 voided')).toBeInTheDocument();
  });
});
