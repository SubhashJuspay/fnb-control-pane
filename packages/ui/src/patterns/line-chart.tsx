'use client';

import * as React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart as RLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface LineChartDatum {
  label: string;
  value: number;
}

export interface LineChartProps {
  data: LineChartDatum[];
  xTickFormatter?: (label: string) => string;
  yTickFormatter?: (value: number) => string;
  valueFormatter?: (value: number) => string;
  stroke?: string;
  testId?: string;
  height?: number;
  /** Hide axes so the chart can render as a tight inline sparkline. */
  sparkline?: boolean;
}

const DEFAULT_STROKE = 'hsl(217, 91%, 60%)';

/**
 * Thin recharts wrapper. Same data contract as `<BarChart>` so consumers can
 * swap between the two without reshaping rows. When `sparkline` is true we
 * drop axes/grid so the chart can drop into a KPI tile.
 */
export function LineChart({
  data,
  xTickFormatter,
  yTickFormatter,
  valueFormatter,
  stroke = DEFAULT_STROKE,
  testId,
  height = 240,
  sparkline = false,
}: LineChartProps) {
  return (
    <div data-testid={testId} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RLineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
          {!sparkline ? (
            <>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="label"
                tickFormatter={xTickFormatter}
                tick={{ fontSize: 11 }}
              />
              <YAxis tickFormatter={yTickFormatter} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: unknown) => {
                  const n = typeof value === 'number' ? value : Number(value);
                  return valueFormatter ? valueFormatter(n) : String(n);
                }}
                labelFormatter={(label: unknown) => {
                  const s = typeof label === 'string' ? label : String(label);
                  return xTickFormatter ? xTickFormatter(s) : s;
                }}
              />
            </>
          ) : null}
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2}
            dot={!sparkline}
          />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}
