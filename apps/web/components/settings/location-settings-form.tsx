'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { Plus, X } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@repo/ui';
import { toast } from 'sonner';
import {
  LocationSettingsDocument,
  UpdateLocationSettingsDocument,
} from '@/lib/graphql/generated/graphql';

type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL: Record<DayKey, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

interface OpeningInterval { open: string; close: string; }
type OpeningHours = Record<DayKey, OpeningInterval[]>;
const EMPTY_HOURS: OpeningHours = {
  sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [],
};

interface AddressShape {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

function parseHours(json: unknown): OpeningHours {
  if (!json || typeof json !== 'object') return { ...EMPTY_HOURS };
  const out: OpeningHours = { ...EMPTY_HOURS };
  for (const day of DAY_KEYS) {
    const arr = (json as Record<string, unknown>)[day];
    if (Array.isArray(arr)) {
      out[day] = arr
        .filter(
          (iv): iv is OpeningInterval =>
            iv != null &&
            typeof iv === 'object' &&
            typeof (iv as { open?: unknown }).open === 'string' &&
            typeof (iv as { close?: unknown }).close === 'string',
        )
        .map((iv) => ({ open: iv.open, close: iv.close }));
    }
  }
  return out;
}

function parseAddress(json: unknown): AddressShape {
  if (!json || typeof json !== 'object') return {};
  const a = json as AddressShape;
  return {
    line1: a.line1 ?? '',
    line2: a.line2 ?? '',
    city: a.city ?? '',
    region: a.region ?? '',
    postalCode: a.postalCode ?? '',
    country: a.country ?? '',
  };
}

export function LocationSettingsForm(): React.JSX.Element {
  const [{ data, fetching, error }, refetch] = useQuery({
    query: LocationSettingsDocument,
    requestPolicy: 'cache-and-network',
  });
  const [, updateSettings] = useMutation(UpdateLocationSettingsDocument);

  const initial = useMemo(() => data?.currentLocation ?? null, [data]);
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<AddressShape>({});
  const [hours, setHours] = useState<OpeningHours>({ ...EMPTY_HOURS });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initial) return;
    setPhone(initial.phone ?? '');
    setAddress(parseAddress(initial.address));
    setHours(parseHours(initial.openingHours));
  }, [initial]);

  if (fetching && !initial) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (error) {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {error.message}
      </p>
    );
  }
  if (!initial) {
    return <p className="text-sm text-muted-foreground">No location in scope.</p>;
  }

  const updateInterval = (day: DayKey, idx: number, field: 'open' | 'close', value: string): void => {
    setHours((prev) => {
      const next = { ...prev, [day]: [...prev[day]] };
      next[day][idx] = { ...next[day][idx], [field]: value } as OpeningInterval;
      return next;
    });
  };
  const addInterval = (day: DayKey): void => {
    setHours((prev) => ({
      ...prev,
      [day]: [...prev[day], { open: '09:00', close: '21:00' }],
    }));
  };
  const removeInterval = (day: DayKey, idx: number): void => {
    setHours((prev) => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== idx),
    }));
  };
  const closeAllDay = (day: DayKey): void => {
    setHours((prev) => ({ ...prev, [day]: [] }));
  };
  const set24x7 = (): void => {
    setHours(() => {
      const open247: OpeningHours = { ...EMPTY_HOURS };
      for (const d of DAY_KEYS) open247[d] = [{ open: '00:00', close: '23:59' }];
      return open247;
    });
  };

  const onSave = async (): Promise<void> => {
    // Validation: each interval must be HH:MM and close > open.
    for (const day of DAY_KEYS) {
      for (const iv of hours[day]) {
        if (!/^\d{2}:\d{2}$/.test(iv.open) || !/^\d{2}:\d{2}$/.test(iv.close)) {
          toast.error(`Invalid time on ${DAY_LABEL[day]}`);
          return;
        }
      }
    }
    setSubmitting(true);
    const cleanedAddress: AddressShape = {};
    for (const k of ['line1', 'line2', 'city', 'region', 'postalCode', 'country'] as const) {
      const v = (address[k] ?? '').trim();
      if (v) cleanedAddress[k] = v;
    }
    const result = await updateSettings({
      input: {
        phone: phone.trim() || null,
        address: Object.keys(cleanedAddress).length > 0 ? cleanedAddress : null,
        openingHours: hours,
      },
    });
    setSubmitting(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Location settings saved');
    refetch({ requestPolicy: 'network-only' });
  };

  return (
    <div className="flex flex-col gap-5" data-testid="location-settings-form">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              data-testid="settings-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 415 555 0142"
            />
          </div>
          <div>
            <Label htmlFor="line1">Street</Label>
            <Input
              id="line1"
              data-testid="settings-address-line1"
              value={address.line1 ?? ''}
              onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              data-testid="settings-address-city"
              value={address.city ?? ''}
              onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="region">State / Region</Label>
            <Input
              id="region"
              data-testid="settings-address-region"
              value={address.region ?? ''}
              onChange={(e) => setAddress((a) => ({ ...a, region: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="postalCode">Postal code</Label>
            <Input
              id="postalCode"
              data-testid="settings-address-postal"
              value={address.postalCode ?? ''}
              onChange={(e) => setAddress((a) => ({ ...a, postalCode: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              data-testid="settings-address-country"
              value={address.country ?? ''}
              onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))}
              placeholder="US"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Opening hours
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (in {initial.timezone})
            </span>
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={set24x7}
            data-testid="settings-247"
          >
            Open 24/7
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {DAY_KEYS.map((day) => {
              const intervals = hours[day];
              return (
                <div
                  key={day}
                  className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start"
                  data-testid={`settings-hours-${day}`}
                >
                  <div className="flex w-20 shrink-0 items-center justify-between">
                    <span className="text-sm font-semibold">{DAY_LABEL[day]}</span>
                    {intervals.length === 0 ? (
                      <span className="text-[10px] uppercase tracking-wide text-rose-600">
                        Closed
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    {intervals.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => addInterval(day)}
                        className="self-start rounded-md border bg-background px-2 py-1 text-xs font-medium hover:bg-muted/40"
                        data-testid={`settings-hours-${day}-add`}
                      >
                        + Add hours
                      </button>
                    ) : (
                      intervals.map((iv, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="time"
                            value={iv.open}
                            onChange={(e) => updateInterval(day, idx, 'open', e.target.value)}
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                            data-testid={`settings-hours-${day}-${idx}-open`}
                          />
                          <span className="text-xs text-muted-foreground">to</span>
                          <input
                            type="time"
                            value={iv.close}
                            onChange={(e) => updateInterval(day, idx, 'close', e.target.value)}
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                            data-testid={`settings-hours-${day}-${idx}-close`}
                          />
                          <button
                            type="button"
                            onClick={() => removeInterval(day, idx)}
                            className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40"
                            aria-label="Remove interval"
                          >
                            <X className="size-4" />
                          </button>
                          {idx === intervals.length - 1 ? (
                            <button
                              type="button"
                              onClick={() => addInterval(day)}
                              className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted/40"
                              title="Add a second interval (e.g. lunch + dinner)"
                            >
                              <Plus className="size-3" />
                              Split
                            </button>
                          ) : null}
                        </div>
                      ))
                    )}
                    {intervals.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => closeAllDay(day)}
                        className="self-start text-xs text-muted-foreground hover:text-foreground"
                      >
                        Mark closed
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onSave}
          disabled={submitting}
          data-testid="settings-save"
        >
          {submitting ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </div>
  );
}
