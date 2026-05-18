'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'urql';
import { toast } from 'sonner';
import { submitOnlineOrderSchema } from '@repo/validation/online-order';
import type { z } from 'zod';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  formatMoney,
} from '@repo/ui';
import {
  OnlinePickupKind,
  SubmitOnlineOrderDocument,
} from '@/lib/graphql/generated/graphql';
import { useCart } from './cart-state';

export interface CartDrawerProps {
  tenantSlug: string;
  locationSlug: string;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  acceptingOrders?: boolean;
  closedReason?: string | null;
}

type DrawerStep = 'cart' | 'details';

const detailsSchema = submitOnlineOrderSchema.innerType().pick({
  customerName: true,
  customerPhone: true,
});
type DetailsValues = z.infer<typeof detailsSchema>;

const INPUT_CLASS =
  'w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 font-body-customer text-on-surface placeholder:text-on-surface-variant/70 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20';

const LABEL_CLASS =
  'mb-2 block font-label-caps text-label-caps uppercase tracking-wider text-outline';

export function CartDrawer({
  tenantSlug,
  locationSlug,
  currency,
  open,
  onOpenChange,
  acceptingOrders = true,
  closedReason = null,
}: CartDrawerProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const openedOnPath = useRef<string | null>(null);
  const [step, setStep] = useState<DrawerStep>('cart');
  useEffect(() => {
    if (!open) {
      openedOnPath.current = null;
      setStep('cart');
      return;
    }
    if (openedOnPath.current === null) {
      openedOnPath.current = pathname;
    } else if (pathname !== openedOnPath.current) {
      onOpenChange(false);
    }
  }, [open, pathname, onOpenChange]);
  const {
    items,
    totalCents,
    itemCount,
    hydrated,
    removeItem,
    setQuantity,
    clear,
    tableSlug,
  } = useCart();
  const isDineIn = Boolean(tableSlug);
  const [{ fetching: submitting }, submit] = useMutation(SubmitOnlineOrderDocument);

  // If the cart becomes empty while we're on the details step, drop back to
  // the cart view so the user sees the empty state, not an orphaned form.
  useEffect(() => {
    if (step === 'details' && items.length === 0) setStep('cart');
  }, [step, items.length]);

  const form = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { customerName: '', customerPhone: '' },
  });

  const onSubmit = async (values: DetailsValues): Promise<void> => {
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
        customerEmail: null,
        pickupKind: OnlinePickupKind.Asap,
        notes: null,
        tableSlug: tableSlug ?? null,
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
    onOpenChange(false);
    const shortNumber = submitted?.shortNumber;
    const search = shortNumber != null ? `?n=${shortNumber}` : '';
    router.push(`/order/${tenantSlug}/${locationSlug}/confirmation/${token}${search}`);
  };

  const canCheckout = items.length > 0 && acceptingOrders && hydrated;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-0 bg-surface p-0 shadow-overlay-soft sm:max-w-[420px]"
        data-testid="cart-drawer"
      >
        <SheetHeader className="space-y-0 border-b border-outline-variant px-container-margin py-stack-loose text-left">
          <div className="flex items-center gap-3">
            {step === 'details' ? (
              <button
                type="button"
                onClick={() => setStep('cart')}
                aria-label="Back to cart"
                className="-ml-2 flex size-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high"
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
            ) : null}
            <SheetTitle className="font-display text-headline-md font-bold text-on-surface">
              {step === 'cart' ? (
                <>
                  Your cart{' '}
                  {itemCount > 0 ? (
                    <span className="font-body-customer text-body-customer font-normal text-on-surface-variant">
                      ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                    </span>
                  ) : null}
                </>
              ) : (
                'Your details'
              )}
            </SheetTitle>
          </div>
          <SheetDescription className="sr-only">
            {step === 'cart'
              ? 'Review your items, then place a pickup order. Pay when you collect.'
              : 'Enter your name and phone number to place the order.'}
          </SheetDescription>
        </SheetHeader>

        {step === 'cart' ? (
          <div className="flex-1 overflow-y-auto px-container-margin py-gutter">
            {!hydrated ? (
              <p className="text-body-staff text-on-surface-variant">Loading cart…</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-4 py-10 text-center">
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
                  Tap any menu item to add it to your order.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-gutter">
                {items.map((item) => {
                  const lineTotal =
                    (item.unitPriceCents + item.modifiersTotalCents) * item.quantity;
                  return (
                    <li
                      key={item.lineId}
                      className="flex gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-sm"
                      data-testid={`cart-line-${item.name}`}
                    >
                      <div className="flex flex-1 flex-col justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-body-customer font-bold text-on-surface">
                              {item.name}
                            </h3>
                            <span className="shrink-0 text-body-customer font-bold tabular-nums text-primary">
                              {formatMoney(lineTotal, currency)}
                            </span>
                          </div>
                          {item.modifiers.length > 0 ? (
                            <ul className="space-y-1">
                              {item.modifiers.map((m) => (
                                <li
                                  key={m.id}
                                  className="flex items-center gap-1.5 text-body-staff text-on-surface-variant"
                                >
                                  <span
                                    aria-hidden
                                    className="size-1.5 rounded-full bg-outline-variant"
                                  />
                                  {m.name}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-body-staff italic text-on-surface-variant">
                              No modifications
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center rounded-lg bg-surface-container-high p-1">
                            <button
                              type="button"
                              onClick={() => setQuantity(item.lineId, item.quantity - 1)}
                              aria-label="Decrease quantity"
                              className="flex size-8 items-center justify-center text-on-surface-variant transition-colors hover:text-primary"
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                remove
                              </span>
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
                              <span className="material-symbols-outlined text-[18px]">
                                add
                              </span>
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
            )}
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              data-testid="cart-details-form"
              id="cart-details-form"
              className="flex-1 overflow-y-auto px-container-margin py-gutter"
            >
              <div className="flex flex-col gap-5">
                {isDineIn ? (
                  <div
                    className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-primary"
                    data-testid="cart-table-chip"
                  >
                    <span
                      className="material-symbols-outlined text-[18px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      table_restaurant
                    </span>
                    <span className="text-body-staff font-semibold">
                      Dining at · Table {tableSlug}
                    </span>
                  </div>
                ) : null}
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
                          data-testid="cart-details-name"
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
                          data-testid="cart-details-phone"
                          className={INPUT_CLASS}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className="rounded-lg bg-surface-container-low px-3 py-2 text-body-staff text-on-surface-variant">
                  {isDineIn
                    ? "We'll fire your order to the kitchen now. Your server will bring it to your table."
                    : "We'll prepare your order as soon as the kitchen confirms it. Pay when you collect."}
                </p>
              </div>
            </form>
          </Form>
        )}

        <div className="border-t border-outline-variant bg-surface-container-low p-container-margin">
          <div className="mb-6 space-y-2">
            <div className="flex justify-between text-body-staff text-on-surface-variant">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(totalCents, currency)}</span>
            </div>
            <p className="text-status-pill text-on-surface-variant">
              {isDineIn
                ? 'Tax is added on your final bill.'
                : 'Tax and final total are confirmed at pickup.'}
            </p>
            <div className="flex justify-between border-t border-outline-variant pt-3 font-display text-headline-md font-bold text-on-surface">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(totalCents, currency)}</span>
            </div>
          </div>

          {!acceptingOrders ? (
            <p
              className="mb-3 rounded-lg border border-error/30 bg-error-container px-3 py-2 text-body-staff font-medium text-error-on-container"
              data-testid="cart-closed-banner"
            >
              {closedReason ?? 'This location is currently closed for online orders.'}
            </p>
          ) : null}

          {step === 'cart' ? (
            <button
              type="button"
              disabled={!canCheckout}
              data-testid="cart-checkout-button"
              onClick={() => {
                if (!canCheckout) return;
                setStep('details');
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-bold text-on-primary shadow-card-soft transition-all hover:bg-primary-container active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>Checkout</span>
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          ) : (
            <button
              type="submit"
              form="cart-details-form"
              disabled={!canCheckout || submitting}
              data-testid="cart-place-order-button"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-bold text-on-primary shadow-card-soft transition-all hover:bg-primary-container active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <span
                    aria-hidden
                    className="material-symbols-outlined animate-spin text-[20px]"
                  >
                    progress_activity
                  </span>
                  {isDineIn ? 'Sending…' : 'Placing order…'}
                </>
              ) : (
                <>
                  <span>{isDineIn ? 'Send to kitchen' : 'Place order'}</span>
                  <span className="material-symbols-outlined">
                    {isDineIn ? 'restaurant' : 'check'}
                  </span>
                </>
              )}
            </button>
          )}

          {step === 'cart' && items.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                const menuPath = `/order/${tenantSlug}/${locationSlug}`;
                if (pathname !== menuPath) {
                  router.push(menuPath);
                }
              }}
              data-testid="cart-continue-button"
              className="mt-3 w-full rounded-xl px-4 py-3 text-body-staff font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              Continue shopping
            </button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
