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

const STATUS_PILL: Record<OnlineOrderConfirmStatus, string> = {
  [OnlineOrderConfirmStatus.Pending]:
    'bg-warning-container text-warning-on-container',
  [OnlineOrderConfirmStatus.Confirmed]:
    'bg-success-container text-success-on-container',
  [OnlineOrderConfirmStatus.Rejected]:
    'bg-error-container text-error-on-container',
};

export function OnlineOrderRequestCard({
  request,
  currency,
  canReject,
}: OnlineOrderRequestCardProps): React.JSX.Element {
  const [{ fetching: confirming }, confirmOrder] = useMutation(
    ConfirmOnlineOrderDocument,
  );
  const [rejectOpen, setRejectOpen] = useState(false);

  const onAccept = async (): Promise<void> => {
    const result = await confirmOrder({
      input: { id: request.id, estimatedReadyAt: null },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`Order #${request.ticket?.shortNumber ?? ''} confirmed`);
  };

  const status = request.confirmStatus ?? null;
  const isPending = status === OnlineOrderConfirmStatus.Pending;
  const total = request.ticket?.totalCents ?? 0;
  const items = (request.ticket?.items ?? []).filter(
    (i): i is NonNullable<typeof i> => i != null,
  );

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft"
      data-testid={`online-order-card-${request.customerName ?? ''}`}
      data-status={status ?? ''}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="flex items-center gap-2">
            <span className="text-body-customer font-bold text-on-surface">
              {request.customerName ?? 'Customer'}
            </span>
            {request.ticket?.shortNumber != null ? (
              <span className="rounded-full bg-secondary-container px-2 py-0.5 font-status-pill text-status-pill uppercase tracking-wider text-secondary-on-container">
                #{request.ticket.shortNumber}
              </span>
            ) : null}
          </p>
          <p className="text-body-staff text-on-surface-variant">
            {request.customerPhone ?? ''}
            {request.pickupKind === 'ASAP' ? ' · ASAP pickup' : ' · Scheduled pickup'}
          </p>
        </div>
        <span
          className={[
            'rounded-full px-2.5 py-1 font-status-pill text-status-pill uppercase tracking-wider',
            status ? STATUS_PILL[status] : 'bg-surface-container text-on-surface-variant',
          ].join(' ')}
          data-testid={`online-order-status-${request.id}`}
        >
          {status ? STATUS_LABEL[status] : 'Unknown'}
        </span>
      </header>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-lg bg-surface-container-low p-3 text-body-staff text-on-surface">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2">
              <span className="font-semibold tabular-nums">
                {it.quantity ?? 1}×
              </span>
              <span>{it.nameSnapshot}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {request.notes ? (
        <p className="rounded-lg border-l-4 border-tertiary bg-tertiary-fixed p-3 text-body-staff italic text-on-tertiary-fixed">
          &ldquo;{request.notes}&rdquo;
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-headline-md font-bold tabular-nums text-primary">
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
                className="border-error text-error hover:bg-error-container"
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
              className="bg-primary text-on-primary hover:opacity-90"
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
