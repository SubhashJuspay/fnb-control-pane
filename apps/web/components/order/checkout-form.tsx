'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'urql';
import { toast } from 'sonner';
import type { z } from 'zod';
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
import {
  OnlineOrderPaymentMode,
  OnlinePickupKind,
  SubmitOnlineOrderDocument,
} from '@/lib/graphql/generated/graphql';
import { useCart } from './cart-state';
import { KioskPaymentOverlay } from './kiosk-payment-overlay';

export interface CheckoutFormProps {
  tenantSlug: string;
  locationSlug: string;
  currency: string;
  acceptingOrders?: boolean;
  closedReason?: string | null;
}

const detailsSchema = submitOnlineOrderSchema.innerType().pick({
  customerName: true,
  customerPhone: true,
});
type DetailsValues = z.infer<typeof detailsSchema>;

const INPUT_CLASS =
  'w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 font-body-customer text-on-surface placeholder:text-on-surface-variant/70 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20';

const LABEL_CLASS =
  'mb-2 block font-label-caps text-label-caps uppercase tracking-wider text-outline';

/**
 * Single-page customer checkout. Replaces the older right-side drawer:
 *
 *   1. Order summary up top (qty / remove / line totals, then subtotal +
 *      total).
 *   2. Customer info form below — name + phone, both required, validated
 *      against the same Zod schema the server uses.
 *   3. Proceed CTA at the bottom — disabled until the form is valid AND the
 *      cart has at least one item.
 *
 * Kiosk mode (`?kiosk=1`) skips the form and uses a placeholder customer;
 * the CTA flips to "Pay $X.XX" and submits directly. The
 * `KioskPaymentOverlay` renders on this same page after submit so the user
 * never sees a behind-the-scenes navigation.
 */
export function CheckoutForm({
  tenantSlug,
  locationSlug,
  currency,
  acceptingOrders = true,
  closedReason = null,
}: CheckoutFormProps): React.JSX.Element {
  const router = useRouter();
  const {
    items,
    totalCents,
    itemCount,
    hydrated,
    removeItem,
    setQuantity,
    clear,
    tableSlug,
    kioskMode,
  } = useCart();
  const [{ fetching: submitting }, submit] = useMutation(SubmitOnlineOrderDocument);

  const [kioskPaymentToken, setKioskPaymentToken] = useState<{
    token: string;
    amountCents: number;
  } | null>(null);

  const form = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    mode: 'onChange',
    defaultValues: { customerName: '', customerPhone: '' },
  });
  const { isValid } = form.formState;

  // If the cart empties while the form is being filled, route back to the
  // menu — there's no order to place.
  useEffect(() => {
    if (hydrated && items.length === 0 && !kioskPaymentToken) {
      // Don't auto-redirect for kiosk mid-payment; the overlay handles it.
    }
  }, [hydrated, items.length, kioskPaymentToken]);

  const isDineIn = Boolean(tableSlug);
  // Both kiosk and non-kiosk flows now collect name + phone, so the
  // Proceed/Pay button gates on the same form-valid check in either mode.
  const canSubmit =
    acceptingOrders && items.length > 0 && !submitting && isValid;

  const submitOrder = async (customer: DetailsValues): Promise<void> => {
    if (items.length === 0) {
      toast.error('Your cart is empty.');
      return;
    }
    if (!acceptingOrders) {
      toast.error('This location is currently closed for online orders.');
      return;
    }
    const amountAtSubmit = totalCents;
    const result = await submit({
      input: {
        tenantSlug,
        locationSlug,
        customerName: customer.customerName,
        customerPhone: customer.customerPhone,
        customerEmail: null,
        pickupKind: OnlinePickupKind.Asap,
        notes: null,
        tableSlug: tableSlug ?? null,
        paymentMode: kioskMode
          ? OnlineOrderPaymentMode.PayAtKiosk
          : OnlineOrderPaymentMode.PayAtPickup,
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
    if (kioskMode) {
      setKioskPaymentToken({ token, amountCents: amountAtSubmit });
      return;
    }
    clear();
    const shortNumber = submitted?.shortNumber;
    const search = shortNumber != null ? `?n=${shortNumber}` : '';
    router.push(`/order/${tenantSlug}/${locationSlug}/confirmation/${token}${search}`);
  };

  const onSubmit = (values: DetailsValues): Promise<void> => submitOrder(values);

  // Empty-cart state — friendly back-to-menu prompt.
  if (hydrated && items.length === 0 && !kioskPaymentToken) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-16 text-center">
        <span
          aria-hidden
          className="material-symbols-outlined text-[48px] text-on-surface-variant/60"
        >
          shopping_cart
        </span>
        <h1 className="font-display text-headline-md font-bold text-on-surface">
          Your cart is empty
        </h1>
        <p className="text-body-staff text-on-surface-variant">
          Browse the menu and pick a few items first.
        </p>
        <Link
          href={`/order/${tenantSlug}/${locationSlug}${kioskMode ? '?kiosk=1' : ''}${
            kioskMode && tableSlug ? `&table=${tableSlug}` : !kioskMode && tableSlug ? `?table=${tableSlug}` : ''
          }`}
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-on-primary shadow-card-soft transition-transform active:scale-95"
        >
          <span className="material-symbols-outlined">arrow_back</span>
          Back to menu
        </Link>
      </div>
    );
  }

  return (
    <>
      {kioskPaymentToken ? (
        <KioskPaymentOverlay
          tenantSlug={tenantSlug}
          locationSlug={locationSlug}
          trackingToken={kioskPaymentToken.token}
          amountCents={kioskPaymentToken.amountCents}
          currency={currency}
          tableSlug={tableSlug}
          onDismiss={() => setKioskPaymentToken(null)}
          onCaptured={() => {
            clear();
            setKioskPaymentToken(null);
            const params = new URLSearchParams({ kiosk: '1' });
            if (tableSlug) params.set('table', tableSlug);
            router.push(`/order/${tenantSlug}/${locationSlug}?${params.toString()}`);
          }}
        />
      ) : null}

      <div className="mx-auto flex max-w-xl flex-col gap-stack-loose">
        <BackToMenuLink
          tenantSlug={tenantSlug}
          locationSlug={locationSlug}
          tableSlug={tableSlug}
          kioskMode={kioskMode}
        />

        <header className="flex flex-col gap-1">
          <h1 className="font-display text-display-md font-bold text-on-background">
            {kioskMode ? 'Pay at terminal' : isDineIn ? 'Review your order' : 'Checkout'}
          </h1>
          <p className="text-body-customer text-on-surface-variant">
            {kioskMode
              ? "Add your details, then tap Pay to start the card terminal."
              : isDineIn
                ? "We'll fire your order to the kitchen as soon as you tap Proceed."
                : "Add a few details and we'll get your order ready for pickup."}
          </p>
        </header>

        {/* Order summary */}
        <section
          className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft"
          data-testid="checkout-summary"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-headline-md font-semibold text-on-surface">
              Your order
            </h2>
            <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
          </div>

          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const lineTotal =
                (item.unitPriceCents + item.modifiersTotalCents) * item.quantity;
              return (
                <li
                  key={item.lineId}
                  className="flex items-start gap-3 border-b border-outline-variant/50 pb-3 last:border-b-0 last:pb-0"
                  data-testid={`checkout-line-${item.name}`}
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-body-customer text-body-customer font-semibold text-on-surface">
                        {item.name}
                      </p>
                      <span className="shrink-0 text-body-customer font-bold tabular-nums text-primary">
                        {formatMoney(lineTotal, currency)}
                      </span>
                    </div>
                    {item.modifiers.length > 0 ? (
                      <p className="text-body-staff text-on-surface-variant">
                        {item.modifiers.map((m) => m.name).join(' · ')}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center rounded-lg bg-surface-container-high p-1">
                        <button
                          type="button"
                          onClick={() => setQuantity(item.lineId, item.quantity - 1)}
                          aria-label="Decrease quantity"
                          className="flex size-8 items-center justify-center text-on-surface-variant transition-colors hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-[18px]">remove</span>
                        </button>
                        <span className="px-3 text-body-staff font-bold tabular-nums text-on-surface">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQuantity(item.lineId, item.quantity + 1)}
                          aria-label="Increase quantity"
                          className="flex size-8 items-center justify-center text-on-surface-variant transition-colors hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-[18px]">add</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.lineId)}
                        aria-label="Remove item"
                        className="rounded-lg p-2 text-error transition-colors hover:bg-error-container"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 space-y-2 border-t border-outline-variant pt-4">
            <div className="flex justify-between text-body-staff text-on-surface-variant">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(totalCents, currency)}</span>
            </div>
            <p className="text-status-pill text-on-surface-variant">
              {kioskMode || isDineIn
                ? 'Tax is added on your final bill.'
                : 'Tax and final total are confirmed at pickup.'}
            </p>
            <div className="flex justify-between border-t border-outline-variant pt-3 font-display text-headline-md font-bold text-on-surface">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(totalCents, currency)}</span>
            </div>
          </div>
        </section>

        {/* Customer info — required in every mode so receipts, the staff
            inbox, and the guest CRM all have something to display. Kiosks
            ask the customer to type it on-screen before paying. */}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            id="checkout-form"
            data-testid="checkout-form"
            className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft"
          >
            <h2 className="mb-4 font-display text-headline-md font-semibold text-on-surface">
              Your details
            </h2>
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL_CLASS}>Full name</FormLabel>
                    <FormControl>
                      <input
                        {...field}
                        type="text"
                        autoComplete="name"
                        placeholder="Jane Smith"
                        data-testid="checkout-name"
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
                        autoComplete="tel"
                        inputMode="tel"
                        placeholder="+52 55 1234 5678"
                        data-testid="checkout-phone"
                        className={INPUT_CLASS}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>

        {!acceptingOrders ? (
          <p
            className="rounded-lg border border-error/30 bg-error-container px-4 py-3 text-body-staff font-medium text-error-on-container"
            data-testid="checkout-closed-banner"
          >
            {closedReason ?? 'This location is currently closed for online orders.'}
          </p>
        ) : null}

        <ProceedButton
          kioskMode={kioskMode}
          isDineIn={isDineIn}
          canSubmit={canSubmit}
          submitting={submitting}
          totalCents={totalCents}
          currency={currency}
        />
      </div>
    </>
  );
}

function BackToMenuLink({
  tenantSlug,
  locationSlug,
  tableSlug,
  kioskMode,
}: {
  tenantSlug: string;
  locationSlug: string;
  tableSlug: string | null;
  kioskMode: boolean;
}): React.JSX.Element {
  const params = new URLSearchParams();
  if (kioskMode) params.set('kiosk', '1');
  if (tableSlug) params.set('table', tableSlug);
  const search = params.toString();
  const href = `/order/${tenantSlug}/${locationSlug}${search ? `?${search}` : ''}`;
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 rounded-lg text-body-staff font-semibold text-on-surface-variant transition-colors hover:text-primary"
      data-testid="checkout-back-link"
    >
      <span className="material-symbols-outlined text-[18px]">arrow_back</span>
      Back to menu
    </Link>
  );
}

function ProceedButton({
  kioskMode,
  isDineIn,
  canSubmit,
  submitting,
  totalCents,
  currency,
}: {
  kioskMode: boolean;
  isDineIn: boolean;
  canSubmit: boolean;
  submitting: boolean;
  totalCents: number;
  currency: string;
}): React.JSX.Element {
  // All three flows submit via the same form so the name + phone fields
  // get validated identically. The label / icon shifts to suit the mode.
  const idleLabel = kioskMode
    ? `Pay ${formatMoney(totalCents, currency)}`
    : isDineIn
      ? 'Send to kitchen'
      : 'Proceed';
  const idleIcon = kioskMode ? 'credit_card' : isDineIn ? 'restaurant' : 'arrow_forward';
  const busyLabel = kioskMode
    ? 'Starting payment…'
    : isDineIn
      ? 'Sending…'
      : 'Placing order…';

  return (
    <button
      type="submit"
      form="checkout-form"
      disabled={!canSubmit}
      data-testid="checkout-submit"
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-bold text-on-primary shadow-card-soft transition-all hover:bg-primary-container active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {submitting ? (
        <>
          <span aria-hidden className="material-symbols-outlined animate-spin text-[20px]">
            progress_activity
          </span>
          {busyLabel}
        </>
      ) : (
        <>
          <span>{idleLabel}</span>
          <span className="material-symbols-outlined">{idleIcon}</span>
        </>
      )}
    </button>
  );
}
