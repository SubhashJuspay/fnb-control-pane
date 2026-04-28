'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@repo/ui';
import { Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export interface ConfirmationCardProps {
  tenantSlug: string;
  locationSlug: string;
  token: string;
}

export function ConfirmationCard({
  tenantSlug,
  locationSlug,
  token,
}: ConfirmationCardProps): React.JSX.Element {
  const [trackingUrl, setTrackingUrl] = useState<string>(
    `/order/${tenantSlug}/${locationSlug}/track/${token}`,
  );

  // Build the absolute URL on the client (window.location only available client-side).
  if (typeof window !== 'undefined') {
    const absolute = `${window.location.origin}/order/${tenantSlug}/${locationSlug}/track/${token}`;
    if (absolute !== trackingUrl) setTrackingUrl(absolute);
  }

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(trackingUrl);
      toast.success('Tracking URL copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-6" data-testid="confirmation-card">
      <div className="flex items-center gap-2 text-primary">
        <CheckCircle2 className="size-5" />
        <h1 className="text-lg font-semibold">Order placed</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        We&apos;ve received your order. The kitchen will confirm it shortly. Save the
        tracking link below to follow your order.
      </p>
      <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tracking URL
        </span>
        <code
          className="block break-all text-xs"
          data-testid="confirmation-tracking-url"
        >
          {trackingUrl}
        </code>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCopy}
          data-testid="confirmation-copy-button"
        >
          <Copy className="mr-2 size-4" />
          Copy tracking URL
        </Button>
        <Button asChild data-testid="confirmation-track-button">
          <Link href={`/order/${tenantSlug}/${locationSlug}/track/${token}`}>
            Track this order
          </Link>
        </Button>
      </div>
    </div>
  );
}
