'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'urql';
import { z } from 'zod';
import { submitOnlineOrderSchema } from '@repo/validation/online-order';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  formatMoney,
} from '@repo/ui';
import { toast } from 'sonner';
import {
  OnlinePickupKind,
  SubmitOnlineOrderDocument,
} from '@/lib/graphql/generated/graphql';
import { useCart } from './cart-state';

export interface CheckoutFormProps {
  tenantSlug: string;
  locationSlug: string;
  currency: string;
  acceptingOrders?: boolean;
}

const formSchema = submitOnlineOrderSchema
  .innerType()
  .pick({
    customerName: true,
    customerPhone: true,
    pickupKind: true,
    notes: true,
  })
  .extend({
    customerEmail: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().email().max(254).optional(),
    ),
  });
type FormValues = z.infer<typeof formSchema>;

const INPUT_CLASS =
  'w-full px-4 py-3 rounded-lg border border-outline-variant bg-surface-container-lowest font-body-customer text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all';

const LABEL_CLASS =
  'block font-label-caps text-label-caps uppercase tracking-wider text-outline mb-2';

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
          values.pickupKind === 'SCHEDULED'
            ? OnlinePickupKind.Scheduled
            : OnlinePickupKind.Asap,
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

  if (!hydrated) {
    return (
      <div
        className="flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-6 py-10 text-center shadow-card-soft"
        data-testid="checkout-loading"
      >
        <p className="text-body-staff text-on-surface-variant">Loading your cart…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-10 text-center shadow-card-soft"
        data-testid="checkout-empty"
      >
        <span
          aria-hidden
          className="material-symbols-outlined text-[40px] text-on-surface-variant/60"
        >
          shopping_cart
        </span>
        <p className="text-body-customer font-semibold text-on-surface">
          Your cart is empty
        </p>
        <p className="text-body-staff text-on-surface-variant">
          Add items from the menu to place a pickup order.
        </p>
        <Link
          href={`/order/${tenantSlug}/${locationSlug}`}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary px-4 py-2 text-body-staff font-semibold text-primary transition-colors hover:bg-primary/5"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to menu
        </Link>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        data-testid="checkout-form"
        className="grid grid-cols-1 gap-gutter lg:grid-cols-12"
      >
        <div className="space-y-gutter lg:col-span-7">
          <h1 className="font-display text-display-lg text-on-background">Checkout</h1>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft">
            <div className="mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">contact_page</span>
              <h2 className="font-display text-headline-md font-semibold text-on-surface">
                Contact Details
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel className={LABEL_CLASS}>Full name</FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        type="text"
                        data-testid="checkout-name"
                        autoComplete="name"
                        placeholder="Jane Smith"
                        className={INPUT_CLASS}
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
                    <FormLabel className={LABEL_CLASS}>Phone number</FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        type="tel"
                        data-testid="checkout-phone"
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="+52 55 1234 5678"
                        className={INPUT_CLASS}
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
                    <FormLabel className={LABEL_CLASS}>Email (optional)</FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        value={field.value ?? ''}
                        type="email"
                        data-testid="checkout-email"
                        autoComplete="email"
                        placeholder="jane@example.com"
                        className={INPUT_CLASS}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>

          <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft">
            <div className="mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">schedule</span>
              <h2 className="font-display text-headline-md font-semibold text-on-surface">
                Pickup Time
              </h2>
            </div>
            <div
              className="flex w-full max-w-md rounded-full bg-surface-container-high p-1"
              data-testid="checkout-pickup-asap"
            >
              <button
                type="button"
                className="flex-1 rounded-full bg-primary px-4 py-2 font-semibold text-on-primary shadow-sm transition-all"
              >
                ASAP (20–30 min)
              </button>
              <button
                type="button"
                disabled
                className="flex-1 cursor-not-allowed rounded-full px-4 py-2 font-semibold text-on-surface-variant/60 transition-all"
                title="Scheduled pickup coming soon"
              >
                Scheduled
              </button>
            </div>
            <p className="mt-4 text-body-customer italic text-on-surface-variant">
              We&apos;ll prepare it as soon as the kitchen confirms.
            </p>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="mt-6">
                  <FormLabel className={LABEL_CLASS}>Notes (optional)</FormLabel>
                  <FormControl>
                    <textarea
                      {...field}
                      value={field.value ?? ''}
                      rows={3}
                      data-testid="checkout-notes"
                      placeholder="Allergies, special instructions"
                      className={`${INPUT_CLASS} min-h-[88px] resize-y`}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </section>
        </div>

        <aside className="lg:col-span-5">
          <div className="sticky top-[88px] rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft">
            <h2 className="mb-6 font-display text-headline-md font-semibold text-on-surface">
              Order Summary
            </h2>
            <ul
              className="mb-6 space-y-4 max-h-[40vh] overflow-y-auto pr-1"
              data-testid="checkout-summary"
            >
              {items.map((item) => {
                const lineTotal =
                  (item.unitPriceCents + item.modifiersTotalCents) * item.quantity;
                return (
                  <li
                    key={item.lineId}
                    className="flex items-start justify-between gap-4"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <h4 className="text-body-customer font-semibold text-on-surface">
                        <span className="tabular-nums text-on-surface-variant">
                          {item.quantity}×
                        </span>{' '}
                        {item.name}
                      </h4>
                      {item.modifiers.length > 0 ? (
                        <p className="mt-1 font-label-caps text-label-caps uppercase tracking-wider text-outline">
                          {item.modifiers.map((m) => m.name).join(', ')}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-body-customer font-semibold tabular-nums text-on-surface">
                      {formatMoney(lineTotal, currency)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="space-y-3 border-t border-outline-variant pt-6">
              <div className="flex justify-between text-body-customer text-on-surface-variant">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatMoney(totalCents, currency)}</span>
              </div>
              <p className="text-status-pill text-on-surface-variant">
                Tax is calculated at the location and shown on your final receipt at pickup.
              </p>
              <div className="mt-2 flex items-baseline justify-between border-t border-outline-variant pt-4">
                <span className="font-display text-headline-md font-semibold text-on-surface">
                  Total
                </span>
                <span className="font-display text-display-lg tabular-nums text-primary">
                  {formatMoney(totalCents, currency)}
                </span>
              </div>
            </div>

            {!acceptingOrders ? (
              <p
                className="mt-4 rounded-lg border border-error/30 bg-error-container px-3 py-2 text-body-staff font-medium text-error-on-container"
                data-testid="checkout-closed-banner"
              >
                This location is currently closed for online orders. Please come back during
                opening hours.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={fetching || items.length === 0 || !acceptingOrders}
              data-testid="checkout-submit"
              className="mt-8 w-full rounded-xl bg-primary py-4 text-lg font-bold text-on-primary shadow-lg shadow-primary/20 transition-all hover:bg-primary-container active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {fetching
                ? 'Submitting…'
                : !acceptingOrders
                  ? 'Closed'
                  : 'Place order'}
            </button>
            <p className="mt-4 text-center font-label-caps text-label-caps uppercase tracking-wider text-outline">
              By placing this order you agree to our Terms of Service.
            </p>
          </div>
        </aside>
      </form>
    </Form>
  );
}
