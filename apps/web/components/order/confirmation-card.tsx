'use client';

import Link from 'next/link';
import { useState } from 'react';
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
    <div
      className="mx-auto flex max-w-2xl flex-col items-center"
      data-testid="confirmation-card"
    >
      <section className="mb-12 w-full text-center">
        <div className="mb-6 inline-flex size-20 items-center justify-center rounded-full bg-success/15">
          <span
            aria-hidden
            className="material-symbols-outlined text-[48px] text-success"
            style={{ fontVariationSettings: "'wght' 700" }}
          >
            check_circle
          </span>
        </div>
        <h1 className="mb-2 font-display text-display-lg text-on-background">
          Order placed
        </h1>
        <p className="text-body-customer text-on-surface-variant">
          We&apos;ve received your order. The kitchen will confirm shortly.
        </p>
        {shortNumber != null ? (
          <div
            className="mt-6 inline-flex flex-col items-center rounded-xl border border-outline-variant bg-surface-container-low px-8 py-4"
            data-testid="confirmation-short-number"
          >
            <span className="mb-1 block font-label-caps text-label-caps uppercase tracking-widest text-outline">
              Order number
            </span>
            <span className="font-display text-display-lg tabular-nums text-primary">
              #{shortNumber}
            </span>
          </div>
        ) : null}
      </section>

      <section className="mb-12 w-full" aria-label="Order progress">
        <div className="relative flex items-start justify-between">
          <Step icon="check" label="Submitted" state="done" />
          <span
            aria-hidden
            className="absolute left-[16.6%] right-[50%] top-4 h-[2px] bg-primary"
          />
          <Step icon="restaurant" label="Kitchen confirming" state="current" />
          <span
            aria-hidden
            className="absolute left-[50%] right-[16.6%] top-4 h-[2px] bg-outline-variant"
          />
          <Step icon="timer" label="Preparing" state="future" />
        </div>
      </section>

      <section className="w-full">
        <div className="relative mb-8 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-card-soft">
          <div
            aria-hidden
            className="absolute -mr-16 -mt-16 right-0 top-0 size-32 rounded-full bg-primary/5"
          />
          <div className="relative z-10">
            <div className="mb-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">share</span>
              <h3 className="font-display text-[18px] font-semibold text-on-background">
                Save your tracking link
              </h3>
            </div>
            <p className="mb-6 text-body-customer text-on-surface-variant">
              You can check back on this page anytime to see live updates on your order
              progress.
            </p>
            <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-dashed border-primary/30 bg-surface-container-lowest p-3">
              <a
                href={trackingPath}
                className="truncate text-body-staff font-medium text-primary"
                data-testid="confirmation-tracking-url"
              >
                {trackingUrl}
              </a>
              <button
                type="button"
                onClick={onCopy}
                data-testid="confirmation-copy-button"
                aria-label="Copy tracking link"
                className="rounded p-1 text-primary transition-colors hover:bg-primary/5"
              >
                <span className="material-symbols-outlined text-[18px]">content_copy</span>
              </button>
            </div>
            <Link
              href={trackingPath}
              data-testid="confirmation-track-button"
              className="block w-full rounded-lg bg-primary py-4 text-center font-bold text-on-primary shadow-lg shadow-primary/20 transition-all hover:bg-primary-container active:scale-[0.98]"
            >
              Track this order
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-gutter md:grid-cols-2">
          <div className="flex items-center gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card-soft">
            <div className="flex size-12 items-center justify-center rounded-lg bg-tertiary-fixed text-tertiary">
              <span className="material-symbols-outlined">location_on</span>
            </div>
            <div>
              <h4 className="text-body-staff font-bold text-on-background">
                Pickup location
              </h4>
              <p className="text-status-pill text-on-surface-variant">
                Shown on your receipt and the tracking page.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-card-soft">
            <div className="flex size-12 items-center justify-center rounded-lg bg-secondary-fixed text-secondary">
              <span className="material-symbols-outlined">schedule</span>
            </div>
            <div>
              <h4 className="text-body-staff font-bold text-on-background">
                Estimated ready
              </h4>
              <p className="text-status-pill text-on-surface-variant">
                Updated when the kitchen confirms.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-12 text-center">
        <Link
          href={`/order/${tenantSlug}/${locationSlug}`}
          className="inline-flex items-center gap-2 font-bold text-primary hover:underline"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Return to menu
        </Link>
      </div>
    </div>
  );
}

interface StepProps {
  icon: string;
  label: string;
  state: 'done' | 'current' | 'future';
}

function Step({ icon, label, state }: StepProps): React.JSX.Element {
  return (
    <div className="relative z-10 flex flex-1 flex-col items-center">
      <div
        className={[
          'mb-2 flex size-8 items-center justify-center rounded-full shadow-sm transition-colors',
          state === 'done'
            ? 'bg-primary text-on-primary'
            : state === 'current'
              ? 'border-2 border-primary bg-surface-container-lowest text-primary'
              : 'bg-surface-container-highest text-outline-variant',
        ].join(' ')}
      >
        <span
          aria-hidden
          className="material-symbols-outlined text-[18px]"
          style={state === 'current' ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          {icon}
        </span>
      </div>
      <span
        className={[
          'text-center font-status-pill text-status-pill',
          state === 'future' ? 'text-outline' : 'text-on-background',
          state === 'current' ? 'font-bold' : '',
        ].join(' ')}
      >
        {label}
      </span>
    </div>
  );
}
