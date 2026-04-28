'use client';

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
}

// Form-level schema: matches submitOnlineOrderSchema for the user-entered
// fields only. Items, tenantSlug, locationSlug get injected at submit time.
const formSchema = submitOnlineOrderSchema.innerType().pick({
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  pickupKind: true,
  notes: true,
});
type FormValues = z.infer<typeof formSchema>;

export function CheckoutForm({
  tenantSlug,
  locationSlug,
  currency,
}: CheckoutFormProps): React.JSX.Element {
  const router = useRouter();
  const { items, totalCents, clear } = useCart();
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
    const token = result.data?.submitOnlineOrder?.trackingToken;
    if (!token) {
      toast.error('Order submission did not return a tracking token.');
      return;
    }
    clear();
    router.push(`/order/${tenantSlug}/${locationSlug}/confirmation/${token}`);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        data-testid="checkout-form"
      >
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
                  placeholder="555-0100"
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
        <FormField
          control={form.control}
          name="pickupKind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Pickup</FormLabel>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={field.value === 'ASAP' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => field.onChange('ASAP')}
                  data-testid="checkout-pickup-asap"
                >
                  ASAP
                </Button>
                <Button
                  type="button"
                  variant={field.value === 'SCHEDULED' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => field.onChange('SCHEDULED')}
                  data-testid="checkout-pickup-scheduled"
                  disabled
                  title="Scheduled pickup coming soon"
                >
                  Scheduled
                </Button>
              </div>
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
                <Input
                  {...field}
                  value={field.value ?? ''}
                  data-testid="checkout-notes"
                  placeholder="Allergies, special instructions"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
          <span className="text-sm">Subtotal ({items.length} items)</span>
          <span className="text-sm font-semibold tabular-nums">
            {formatMoney(totalCents, currency)}
          </span>
        </div>
        <Button
          type="submit"
          disabled={fetching || items.length === 0}
          data-testid="checkout-submit"
        >
          {fetching ? 'Submitting…' : 'Place order'}
        </Button>
      </form>
    </Form>
  );
}
