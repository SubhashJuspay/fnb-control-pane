'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'urql';
import type { z } from 'zod';
import { rejectOnlineOrderSchema } from '@repo/validation/online-order';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@repo/ui';
import { toast } from 'sonner';
import { RejectOnlineOrderDocument } from '@/lib/graphql/generated/graphql';

export interface RejectOnlineOrderDialogProps {
  requestId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formSchema = rejectOnlineOrderSchema.pick({ rejectReason: true });
type FormValues = z.infer<typeof formSchema>;

export function RejectOnlineOrderDialog({
  requestId,
  open,
  onOpenChange,
}: RejectOnlineOrderDialogProps): React.JSX.Element {
  const [{ fetching }, reject] = useMutation(RejectOnlineOrderDocument);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { rejectReason: '' },
  });

  const onSubmit = async (values: FormValues): Promise<void> => {
    const result = await reject({
      input: { id: requestId, rejectReason: values.rejectReason },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Order rejected');
    onOpenChange(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="reject-online-order-dialog">
        <DialogHeader>
          <DialogTitle>Reject this order?</DialogTitle>
          <DialogDescription>
            The customer will see this reason on their tracking page. The
            ticket and items will be voided.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <FormField
              control={form.control}
              name="rejectReason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Out of stock; closing soon; etc."
                      data-testid="reject-reason-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={fetching}
                data-testid="reject-online-order-submit"
              >
                {fetching ? 'Rejecting…' : 'Reject'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
