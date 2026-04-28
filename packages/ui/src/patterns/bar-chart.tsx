'use client';

import * as React from 'react';
import {
  Bar,
  CartesianGrid,
  BarChart as RBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarChartDatum[];
  /** Render a tick on the x-axis, e.g. capitalize / shorten. Defaults to the raw label. */
  xTickFormatter?: (label: string) => string;
  /** Render a tick on the y-axis, e.g. money formatter. */
  yTickFormatter?: (value: number) => string;
  /** Render the value inside the tooltip (returns string). */
  valueFormatter?: (value: number) => string;
  /** Override the bar colour. */
  fill?: string;
  /** Optional data-testid; one bar element per row gets `${testId}-bar-<idx>`. */
  testId?: string;
  height?: number;
}

const DEFAULT_FILL = 'hsl(217, 91%, 60%)';

/**
 * Thin recharts wrapper that constrains the chart shape to "label → numeric
 * value" so reports can map analytics rows into a single shared shape.
 * Consumers pass formatters for axes / tooltip.
 */
export function BarChart({
  data,
  xTickFormatter,
  yTickFormatter,
  valueFormatter,
  fill = DEFAULT_FILL,
  testId,
  height = 240,
}: BarChartProps) {
  return (
    <div data-testid={testId} style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RBarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
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
          <Bar dataKey="value" fill={fill} radius={[4, 4, 0, 0]} />
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
