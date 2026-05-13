'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'urql';
import { z } from 'zod';
import { Calendar, Users } from 'lucide-react';
import { submitReservationRequestSchema } from '@repo/validation/reservation';
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@repo/ui';
import { toast } from 'sonner';
import { SubmitReservationRequestDocument } from '@/lib/graphql/generated/graphql';

export interface BookingFormProps {
  tenantSlug: string;
  locationSlug: string;
}

// Customer-facing slice of the validation schema (server still re-validates).
const formSchema = submitReservationRequestSchema
  .pick({
    guestName: true,
    guestPhone: true,
    partySize: true,
    notes: true,
  })
  .extend({
    guestEmail: z
      .preprocess((v) => (v === '' ? undefined : v), z.string().email().max(254).optional()),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'Pick a time'),
  });
type FormValues = z.infer<typeof formSchema>;

const TEXTAREA_CLASS =
  'flex min-h-[80px] w-full rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function defaultTime(): string {
  // Default to next round half-hour after now, capped at 22:00.
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30, 0, 0);
  const minute = d.getMinutes() < 30 ? '00' : '30';
  const h = d.getMinutes() < 30 ? d.getHours() : d.getHours();
  const hh = String(Math.min(h, 22)).padStart(2, '0');
  return `${hh}:${minute}`;
}

export function BookingForm({
  tenantSlug,
  locationSlug,
}: BookingFormProps): React.JSX.Element {
  const router = useRouter();
  const [{ fetching }, submit] = useMutation(SubmitReservationRequestDocument);
  const [submitted, setSubmitted] = useState<{
    partySize: number;
    requestedTime: string;
  } | null>(null);
  const minDate = useMemo(todayIso, []);
  const initialTime = useMemo(defaultTime, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      guestName: '',
      guestPhone: '',
      guestEmail: '',
      partySize: 2,
      date: minDate,
      time: initialTime,
      notes: '',
    },
  });

  const onSubmit = async (values: FormValues): Promise<void> => {
    // Combine local date + time into an ISO string. The server uses the
    // location's timezone to validate against opening hours.
    const requestedTime = new Date(`${values.date}T${values.time}:00`).toISOString();
    const result = await submit({
      input: {
        tenantSlug,
        locationSlug,
        guestName: values.guestName,
        guestPhone: values.guestPhone,
        guestEmail: values.guestEmail || null,
        partySize: values.partySize,
        requestedTime,
        notes: values.notes || null,
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    const out = result.data?.submitReservationRequest;
    if (!out) {
      toast.error('Could not submit your request. Please try again.');
      return;
    }
    setSubmitted({
      partySize: out.partySize ?? values.partySize,
      requestedTime: typeof out.requestedTime === 'string'
        ? out.requestedTime
        : new Date(out.requestedTime as Date).toISOString(),
    });
    router.refresh();
  };

  if (submitted) {
    const when = new Date(submitted.requestedTime);
    return (
      <div
        className="flex flex-col gap-3 rounded-xl border bg-card p-6 text-center"
        data-testid="booking-success"
      >
        <div className="flex flex-col items-center gap-1">
          <Calendar className="size-8 text-primary" aria-hidden />
          <p className="text-base font-semibold">Request received</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Thanks — we&apos;ve sent your request to the host. They&apos;ll confirm or
          suggest a different time shortly.
        </p>
        <dl className="mx-auto grid max-w-xs grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-sm">
          <dt className="text-muted-foreground">Party</dt>
          <dd className="text-right">
            {submitted.partySize}{' '}
            {submitted.partySize === 1 ? 'guest' : 'guests'}
          </dd>
          <dt className="text-muted-foreground">When</dt>
          <dd className="text-right">{when.toLocaleString()}</dd>
        </dl>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
        data-testid="booking-form"
      >
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">When &amp; how many</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="date"
                      min={minDate}
                      data-testid="booking-date"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Time</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="time"
                      data-testid="booking-time"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="partySize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Guests</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min={1}
                      max={40}
                      data-testid="booking-party-size"
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Your details</h2>
          <FormField
            control={form.control}
            name="guestName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="name"
                    placeholder="Jane Smith"
                    data-testid="booking-name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="guestPhone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="555-0100"
                    data-testid="booking-phone"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="guestEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email (optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ''}
                    type="email"
                    autoComplete="email"
                    placeholder="jane@example.com"
                    data-testid="booking-email"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (optional)</FormLabel>
                <FormControl>
                  <textarea
                    {...field}
                    value={field.value ?? ''}
                    rows={3}
                    placeholder="High chair? Anniversary? Allergies?"
                    className={TEXTAREA_CLASS}
                    data-testid="booking-notes"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden />
            Requests are confirmed by the host before your booking is final.
          </span>
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={fetching}
          data-testid="booking-submit"
        >
          {fetching ? 'Submitting…' : 'Request booking'}
        </Button>
      </form>
    </Form>
  );
}
