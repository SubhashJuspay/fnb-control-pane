'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/dialog.js';
import { Button } from '../components/button.js';
import { Input } from '../components/input.js';
import { Label } from '../components/label.js';
import { cn } from '../lib/cn.js';
import {
  ScheduleSummary,
  type DayOfWeek,
  type Schedule,
  type ScheduleWindow,
} from './schedule-summary.js';

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'MON', label: 'Mon' },
  { value: 'TUE', label: 'Tue' },
  { value: 'WED', label: 'Wed' },
  { value: 'THU', label: 'Thu' },
  { value: 'FRI', label: 'Fri' },
  { value: 'SAT', label: 'Sat' },
  { value: 'SUN', label: 'Sun' },
];

export interface ScheduleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: Schedule;
  onChange: (schedule: Schedule) => void;
}

type Mode = 'always' | 'weekly';

function makeDefaultWindow(): ScheduleWindow {
  return { days: ['MON', 'TUE', 'WED', 'THU', 'FRI'], start: '09:00', end: '17:00' };
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validate(mode: Mode, windows: ScheduleWindow[]): string | null {
  if (mode === 'always') return null;
  if (windows.length === 0) return 'Add at least one window or switch to "Always live".';
  for (let i = 0; i < windows.length; i += 1) {
    const w = windows[i]!;
    if (w.days.length === 0) return `Window ${i + 1}: pick at least one day.`;
    if (!isValidTime(w.start) || !isValidTime(w.end))
      return `Window ${i + 1}: use HH:MM (24-hour) for both times.`;
    if (!(w.start < w.end)) return `Window ${i + 1}: end time must be after start.`;
  }
  return null;
}

function deriveDraft(value: Schedule): { mode: Mode; windows: ScheduleWindow[] } {
  if (value.kind === 'always') return { mode: 'always', windows: [] };
  return { mode: 'weekly', windows: value.windows.map(cloneWindow) };
}

function cloneWindow(w: ScheduleWindow): ScheduleWindow {
  return { days: [...w.days], start: w.start, end: w.end };
}

/**
 * Dialog for editing a Schedule. Owns its own draft state until the user
 * clicks Save; calls `onChange` exactly once with the validated schedule.
 *
 * Validation is intentionally local (mirrors the rules in `scheduleSchema`
 * from @repo/validation) so consumers can keep this in @repo/ui without a
 * direct validation dependency.
 */
export function ScheduleEditor({
  open,
  onOpenChange,
  value,
  onChange,
}: ScheduleEditorProps): React.JSX.Element {
  const [draft, setDraft] = React.useState(() => deriveDraft(value));
  const [error, setError] = React.useState<string | null>(null);

  // Reset draft each time the dialog is opened so cancel discards changes.
  React.useEffect(() => {
    if (open) {
      setDraft(deriveDraft(value));
      setError(null);
    }
  }, [open, value]);

  const previewSchedule: Schedule =
    draft.mode === 'always' ? { kind: 'always' } : { kind: 'weekly', windows: draft.windows };

  const setMode = (mode: Mode): void => {
    setError(null);
    if (mode === 'always') {
      setDraft({ mode: 'always', windows: draft.windows });
      return;
    }
    setDraft({
      mode: 'weekly',
      windows: draft.windows.length > 0 ? draft.windows : [makeDefaultWindow()],
    });
  };

  const updateWindow = (index: number, patch: Partial<ScheduleWindow>): void => {
    setDraft((prev) => ({
      ...prev,
      windows: prev.windows.map((w, i) => (i === index ? { ...w, ...patch } : w)),
    }));
  };

  const toggleDay = (index: number, day: DayOfWeek): void => {
    setDraft((prev) => ({
      ...prev,
      windows: prev.windows.map((w, i) => {
        if (i !== index) return w;
        const has = w.days.includes(day);
        return {
          ...w,
          days: has ? w.days.filter((d) => d !== day) : [...w.days, day],
        };
      }),
    }));
  };

  const addWindow = (): void => {
    setDraft((prev) => ({ ...prev, windows: [...prev.windows, makeDefaultWindow()] }));
  };

  const removeWindow = (index: number): void => {
    setDraft((prev) => ({ ...prev, windows: prev.windows.filter((_, i) => i !== index) }));
  };

  const onSave = (): void => {
    const validationError = validate(draft.mode, draft.windows);
    if (validationError) {
      setError(validationError);
      return;
    }
    onChange(
      draft.mode === 'always'
        ? { kind: 'always' }
        : { kind: 'weekly', windows: draft.windows.map(cloneWindow) },
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Schedule</DialogTitle>
          <DialogDescription>
            Choose when this menu should be live at the location.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="Schedule mode" className="inline-flex rounded-md border p-0.5 self-start">
            <button
              type="button"
              role="radio"
              aria-checked={draft.mode === 'always'}
              onClick={() => setMode('always')}
              className={cn(
                'rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
                draft.mode === 'always'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Always live
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={draft.mode === 'weekly'}
              onClick={() => setMode('weekly')}
              className={cn(
                'rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
                draft.mode === 'weekly'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Schedule
            </button>
          </div>

          {draft.mode === 'weekly' ? (
            <div className="flex flex-col gap-3">
              {draft.windows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No windows yet.</p>
              ) : null}
              {draft.windows.map((w, i) => (
                <div key={i} className="grid gap-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Window {i + 1}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove window ${i + 1}`}
                      onClick={() => removeWindow(i)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                  <div>
                    <Label className="text-xs">Days</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {DAYS.map((d) => {
                        const checked = w.days.includes(d.value);
                        return (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            aria-label={d.label}
                            key={d.value}
                            onClick={() => toggleDay(i, d.value)}
                            className={cn(
                              'h-8 w-12 rounded-md border text-xs font-medium transition-colors',
                              checked
                                ? 'bg-foreground text-background border-foreground'
                                : 'bg-surface text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label htmlFor={`window-${i}-start`} className="text-xs">
                        Start
                      </Label>
                      <Input
                        id={`window-${i}-start`}
                        type="time"
                        value={w.start}
                        onChange={(e) => updateWindow(i, { start: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`window-${i}-end`} className="text-xs">
                        End
                      </Label>
                      <Input
                        id={`window-${i}-end`}
                        type="time"
                        value={w.end}
                        onChange={(e) => updateWindow(i, { end: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addWindow} className="self-start">
                <Plus className="h-4 w-4 mr-1" aria-hidden />
                Add window
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This menu will be live at all times.
            </p>
          )}

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-xs uppercase tracking-wide text-muted-foreground mr-2">Preview</span>
            <ScheduleSummary schedule={previewSchedule} />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
