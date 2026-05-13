'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'urql';
import { z } from 'zod';
import { submitOnlineOrderSchema } from '@repo/validation/online-order';
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  formatMoney,
} from '@repo/ui';
import { toast } from 'sonner';
import { OnlinePickupKind, SubmitOnlineOrderDocument } from '@/lib/graphql/generated/graphql';
import { useCart } from './cart-state';

export interface CheckoutFormProps {
  tenantSlug: string;
  locationSlug: string;
  currency: string;
  /** When false, the submit button is disabled with a "we're closed" note. */
  acceptingOrders?: boolean;
}

// Form-level schema: matches submitOnlineOrderSchema for the user-entered
// fields only. Items, tenantSlug, locationSlug get injected at submit time.
const formSchema = submitOnlineOrderSchema
  .innerType()
  .pick({
    customerName: true,
    customerPhone: true,
    pickupKind: true,
    notes: true,
  })
  .extend({
    customerEmail: z
      .preprocess((v) => (v === '' ? undefined : v), z.string().email().max(254).optional()),
  });
type FormValues = z.infer<typeof formSchema>;

const TEXTAREA_CLASS =
  'flex min-h-[80px] w-full rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export function CheckoutForm({
  tenantSlug,
  locationSlug,
  currency,
  acceptingOrders = true,
}: CheckoutFormProps): React.JSX.Element {
  const router = useRouter();
  const { items, totalCents, clear, hydrated } = useCart();
  const [{ fetching }, submit] = useMutation(SubmitOnlineOrderDocument);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      pickupKind: 'ASAP',
      notes: '',
    },
  });

  const onSubmit = async (values: FormValues): Promise<void> => {
    if (items.length === 0) {
      toast.error('Your cart is empty.');
      return;
    }
    if (!acceptingOrders) {
      toast.error('This location is currently closed for online orders.');
      return;
    }
    const result = await submit({
      input: {
        tenantSlug,
        locationSlug,
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        customerEmail: values.customerEmail || null,
        pickupKind:
          values.pickupKind === 'SCHEDULED' ? OnlinePickupKind.Scheduled : OnlinePickupKind.Asap,
        notes: values.notes || null,
        items: items.map((i) => ({
          menuItemId: i.menuItemId,
          quantity: i.quantity,
          modifiers: i.modifierIds,
          notes: i.notes ?? null,
        })),
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    const submitted = result.data?.submitOnlineOrder;
    const token = submitted?.trackingToken;
    if (!token) {
      toast.error('Order submission did not return a tracking token.');
      return;
    }
    clear();
    const shortNumber = submitted?.shortNumber;
    const search = shortNumber != null ? `?n=${shortNumber}` : '';
    router.push(
      `/order/${tenantSlug}/${locationSlug}/confirmation/${token}${search}`,
    );
  };

  // Guard against the first-paint flash: until the CartProvider has read
  // sessionStorage, `items` is always [] regardless of what's actually in
  // the cart. Render a thin loading frame instead of the "empty cart" UI.
  if (!hydrated) {
    return (
      <div
        className="flex flex-col gap-2 rounded-xl border bg-muted/30 px-6 py-10 text-center"
        data-testid="checkout-loading"
      >
        <p className="text-sm text-muted-foreground">Loading your cart…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center"
        data-testid="checkout-empty"
      >
        <p className="text-sm font-medium">Your cart is empty</p>
        <p className="text-xs text-muted-foreground">
          Add items from the menu to place a pickup order.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/order/${tenantSlug}/${locationSlug}`}>Back to menu</Link>
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5"
        data-testid="checkout-form"
      >
        <section
          className="flex flex-col gap-2 rounded-lg border bg-card p-4"
          aria-label="Order summary"
        >
          <h2 className="text-sm font-semibold">Order summary</h2>
          <ul className="flex flex-col divide-y" data-testid="checkout-summary">
            {items.map((item) => {
              const lineTotal =
                (item.unitPriceCents + item.modifiersTotalCents) * item.quantity;
              return (
                <li
                  key={item.lineId}
                  className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">
                        <span className="tabular-nums text-muted-foreground">
                          {item.quantity}×
                        </span>{' '}
                        {item.name}
                      </span>
                    </div>
                    {item.modifiers.length > 0 ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.modifiers.map((m) => m.name).join(', ')}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatMoney(lineTotal, currency)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm">
            <span>Subtotal</span>
            <span className="font-semibold tabular-nums">
              {formatMoney(totalCents, currency)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Tax is calculated at the location and shown on your final receipt at pickup.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Contact</h2>
          <FormField
            control={form.control}
            name="customerName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Your name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="checkout-name"
                    autoComplete="name"
                    placeholder="Jane Smith"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="customerPhone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    data-testid="checkout-phone"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="+52 55 1234 5678"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="customerEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email (optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ''}
                    data-testid="checkout-email"
                    type="email"
                    autoComplete="email"
                    placeholder="jane@example.com"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Pickup</h2>
          <div
            className="flex items-center justify-between rounded-md border bg-muted/30 p-3 text-sm"
            data-testid="checkout-pickup-asap"
          >
            <span>
              <span className="font-medium">ASAP</span>
              <span className="ml-2 text-xs text-muted-foreground">
                We&apos;ll prepare it as soon as the kitchen confirms.
              </span>
            </span>
            <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Default
            </span>
          </div>
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
                    data-testid="checkout-notes"
                    placeholder="Allergies, special instructions"
                    rows={3}
                    className={TEXTAREA_CLASS}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {!acceptingOrders ? (
          <p
            className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
            data-testid="checkout-closed-banner"
          >
            This location is currently closed for online orders. Please come back during opening hours.
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          disabled={fetching || items.length === 0 || !acceptingOrders}
          data-testid="checkout-submit"
        >
          {fetching
            ? 'Submitting…'
            : !acceptingOrders
              ? 'Closed'
              : `Place order • ${formatMoney(totalCents, currency)}`}
        </Button>
      </form>
    </Form>
  );
}
