'use client';

import { Download } from 'lucide-react';
import { Button } from '@repo/ui';

export interface CsvColumn<T> {
  header: string;
  /** Cell value as a primitive — coerced to a CSV-safe string by the caller. */
  value: (row: T) => string | number | null | undefined;
}

export interface DownloadCsvButtonProps<T> {
  /** Filename without extension. */
  filename: string;
  rows: ReadonlyArray<T>;
  columns: ReadonlyArray<CsvColumn<T>>;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'default';
}

/** Escape a single field for RFC-4180 CSV. */
function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv<T>(rows: ReadonlyArray<T>, columns: ReadonlyArray<CsvColumn<T>>): string {
  const header = columns.map((c) => csvEscape(c.header)).join(',');
  const body = rows
    .map((row) => columns.map((c) => csvEscape(c.value(row))).join(','))
    .join('\n');
  // Excel sniffs UTF-8 with BOM correctly; without it some locales mis-parse.
  return '﻿' + header + (body ? '\n' + body : '') + '\n';
}

/**
 * Generic "Download CSV" button. Clicking builds the CSV in-memory and
 * triggers a `<a download>` click, with a date-stamped filename. No new
 * resolver — re-uses the data already fetched by the parent component.
 */
export function DownloadCsvButton<T>({
  filename,
  rows,
  columns,
  disabled,
  className,
  size = 'sm',
}: DownloadCsvButtonProps<T>): React.JSX.Element {
  const onClick = (): void => {
    const csv = buildCsv(rows, columns);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${filename}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={disabled || rows.length === 0}
      onClick={onClick}
      className={className}
      data-testid="download-csv"
    >
      <Download className="mr-1.5 size-4" />
      CSV
    </Button>
  );
}
