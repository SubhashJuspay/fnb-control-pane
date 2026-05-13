'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@repo/ui';
import { CheckCircle2, ChefHat, Copy, Flame, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';

export interface ConfirmationCardProps {
  tenantSlug: string;
  locationSlug: string;
  token: string;
  shortNumber?: number | null;
}

export function ConfirmationCard({
  tenantSlug,
  locationSlug,
  token,
  shortNumber = null,
}: ConfirmationCardProps): React.JSX.Element {
  const trackingPath = `/order/${tenantSlug}/${locationSlug}/track/${token}`;
  const [trackingUrl, setTrackingUrl] = useState<string>(trackingPath);

  // Build the absolute URL on the client (window.location only available client-side).
  if (typeof window !== 'undefined') {
    const absolute = `${window.location.origin}${trackingPath}`;
    if (absolute !== trackingUrl) setTrackingUrl(absolute);
  }

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(trackingUrl);
      toast.success('Tracking link copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="confirmation-card">
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-gradient-to-b from-primary/5 to-card p-6 text-center">
        <CheckCircle2 className="size-10 text-primary" aria-hidden />
        <h1 className="text-lg font-semibold">Order placed</h1>
        {shortNumber != null ? (
          <div
            className="flex flex-col items-center gap-0.5"
            data-testid="confirmation-short-number"
          >
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Order number
            </span>
            <span className="text-3xl font-semibold tabular-nums">#{shortNumber}</span>
          </div>
        ) : null}
        <p className="max-w-sm text-sm text-muted-foreground">
          The kitchen will confirm your order shortly. You&apos;ll see status updates on the
          tracking page.
        </p>
      </div>

      <ol className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <li className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShoppingBag className="size-4" aria-hidden />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium">Submitted</span>
            <span className="text-xs text-muted-foreground">
              We&apos;ve received your order.
            </span>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ChefHat className="size-4" aria-hidden />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium">Kitchen confirms</span>
            <span className="text-xs text-muted-foreground">
              Usually within a couple of minutes.
            </span>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Flame className="size-4" aria-hidden />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium">Preparing</span>
            <span className="text-xs text-muted-foreground">
              We&apos;ll let you know when it&apos;s ready for pickup.
            </span>
          </div>
        </li>
      </ol>

      <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Save your tracking link
        </span>
        <a
          href={trackingPath}
          className="block break-all text-xs font-medium text-primary underline-offset-2 hover:underline"
          data-testid="confirmation-tracking-url"
        >
          {trackingUrl}
        </a>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1" data-testid="confirmation-track-button">
            <Link href={trackingPath}>Track this order</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCopy}
            data-testid="confirmation-copy-button"
            className="sm:w-auto"
          >
            <Copy className="mr-2 size-4" />
            Copy link
          </Button>
        </div>
      </div>
    </div>
  );
}
