'use client';

import { useState } from 'react';
import { useMutation } from 'urql';
import { Button, formatMoney } from '@repo/ui';
import { toast } from 'sonner';
import {
  ConfirmOnlineOrderDocument,
  OnlineOrderConfirmStatus,
  type OnlineOrderRequestsQuery,
} from '@/lib/graphql/generated/graphql';
import { RejectOnlineOrderDialog } from './reject-online-order-dialog';

type Request = NonNullable<OnlineOrderRequestsQuery['onlineOrderRequests']>[number];

export interface OnlineOrderRequestCardProps {
  request: Request;
  currency: string;
  canReject: boolean;
}

const STATUS_LABEL: Record<OnlineOrderConfirmStatus, string> = {
  [OnlineOrderConfirmStatus.Pending]: 'Pending',
  [OnlineOrderConfirmStatus.Confirmed]: 'Confirmed',
  [OnlineOrderConfirmStatus.Rejected]: 'Rejected',
};

export function OnlineOrderRequestCard({
  request,
  currency,
  canReject,
}: OnlineOrderRequestCardProps): React.JSX.Element {
  const [{ fetching: confirming }, confirmOrder] = useMutation(ConfirmOnlineOrderDocument);
  const [rejectOpen, setRejectOpen] = useState(false);

  const onAccept = async (): Promise<void> => {
    const result = await confirmOrder({ input: { id: request.id, estimatedReadyAt: null } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`Order #${request.ticket?.shortNumber ?? ''} confirmed`);
  };

  const status = request.confirmStatus ?? null;
  const isPending = status === OnlineOrderConfirmStatus.Pending;
  const total = request.ticket?.totalCents ?? 0;
  const items = (request.ticket?.items ?? []).filter((i): i is NonNullable<typeof i> => i != null);

  return (
    <article
      className="flex flex-col gap-3 rounded-md border bg-card p-4"
      data-testid={`online-order-card-${request.customerName ?? ''}`}
      data-status={status ?? ''}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {request.customerName ?? 'Customer'}{' '}
            {request.ticket?.shortNumber != null ? (
              <span className="text-xs font-normal text-muted-foreground">
                #{request.ticket.shortNumber}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {request.customerPhone ?? ''}
            {request.pickupKind === 'ASAP' ? ' • ASAP pickup' : ' • Scheduled pickup'}
          </p>
        </div>
        <span
          className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
          data-testid={`online-order-status-${request.id}`}
        >
          {status ? STATUS_LABEL[status] : 'Unknown'}
        </span>
      </header>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {items.map((it) => (
            <li key={it.id}>
              {it.quantity ?? 1}× {it.nameSnapshot}
            </li>
          ))}
        </ul>
      ) : null}
      {request.notes ? (
        <p className="rounded-md bg-muted/40 p-2 text-xs italic">{request.notes}</p>
      ) : null}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tabular-nums">
          {formatMoney(total, currency)}
        </span>
        {isPending ? (
          <div className="flex gap-2">
            {canReject ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRejectOpen(true)}
                data-testid={`online-order-reject-${request.id}`}
              >
                Reject
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={onAccept}
              disabled={confirming}
              data-testid={`online-order-accept-${request.id}`}
            >
              {confirming ? 'Accepting…' : 'Accept'}
            </Button>
          </div>
        ) : null}
      </div>
      <RejectOnlineOrderDialog
        requestId={request.id ?? ''}
        open={rejectOpen}
        onOpenChange={setRejectOpen}
      />
    </article>
  );
}
