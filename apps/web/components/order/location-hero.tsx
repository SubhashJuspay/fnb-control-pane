'use client';

import { useEffect, useState } from 'react';
import {
  computeOpenStatus,
  formatDayIntervals,
  formatHM,
  parseOpeningHours,
} from '@/lib/location-hours';

export interface LocationHeroProps {
  tenantName: string;
  locationName: string;
  currency: string;
  timezone: string;
  phone: string | null;
  address: unknown;
  openingHours: unknown;
}

interface AddressShape {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

function formatAddress(addr: unknown): { display: string; mapsQuery: string } | null {
  if (!addr || typeof addr !== 'object') return null;
  const a = addr as AddressShape;
  const parts = [a.line1, a.line2, a.city, a.region, a.postalCode, a.country].filter(
    (p): p is string => Boolean(p),
  );
  if (parts.length === 0) return null;
  return {
    display: parts.join(', '),
    mapsQuery: encodeURIComponent(parts.join(', ')),
  };
}

export function LocationHero(props: LocationHeroProps): React.JSX.Element {
  const { tenantName, locationName, timezone, phone, address, openingHours } = props;
  const hours = parseOpeningHours(openingHours);
  const formattedAddress = formatAddress(address);

  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const status = hours ? computeOpenStatus(hours, timezone, now) : null;

  return (
    <section aria-label="Welcome" data-testid="location-hero" className="mb-stack-loose">
      <div className="relative h-[280px] w-full overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary-container to-secondary shadow-card-soft sm:h-[320px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/banner.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-stack-loose">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-primary-container px-3 py-1 font-status-pill text-status-pill text-on-primary">
              Pickup
            </span>
            <span className="rounded-full bg-surface-container-lowest px-3 py-1 font-status-pill text-status-pill text-on-surface">
              Pay on pickup
            </span>
            {status ? (
              <span
                data-testid="location-open-status"
                data-open={status.isOpen ? 'true' : 'false'}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-status-pill text-status-pill',
                  status.isOpen
                    ? 'bg-success/15 text-success-on-container backdrop-blur-sm'
                    : 'bg-error/20 text-error-on-container backdrop-blur-sm',
                ].join(' ')}
                style={{
                  backgroundColor: status.isOpen
                    ? 'rgba(16, 185, 129, 0.25)'
                    : 'rgba(186, 26, 26, 0.25)',
                  color: 'white',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <span
                  aria-hidden
                  className={[
                    'inline-block size-1.5 rounded-full',
                    status.isOpen ? 'bg-emerald-400' : 'bg-rose-400',
                  ].join(' ')}
                />
                {status.isOpen
                  ? status.closesAt
                    ? `Open · closes ${formatHM(status.closesAt)}`
                    : 'Open'
                  : status.reopensAt
                    ? status.reopensAt.relative === 'today'
                      ? `Closed · opens ${formatHM(status.reopensAt.time)}`
                      : status.reopensAt.relative === 'tomorrow'
                        ? `Closed · opens tomorrow ${formatHM(status.reopensAt.time)}`
                        : `Closed · opens ${formatHM(status.reopensAt.time)}`
                    : 'Closed'}
              </span>
            ) : null}
          </div>
          {/* Hero headline scales down on small viewports — display-lg (36px)
              wraps to three awkward lines for any tenant name longer than
              ~14 characters on a 390px phone. */}
          <h2 className="font-display text-[28px] font-bold leading-tight text-white sm:text-display-lg">
            {tenantName}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-body-customer text-white/90">
            <span className="material-symbols-outlined text-[18px]">storefront</span>
            {locationName}
            {status && status.closesAt ? (
              <>
                <span aria-hidden>•</span>
                <span>
                  {status.isOpen
                    ? `Open until ${formatHM(status.closesAt)}`
                    : status.reopensAt
                      ? `Opens ${formatHM(status.reopensAt.time)}`
                      : 'Closed'}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {(formattedAddress || phone || (status && status.todayIntervals.length > 0)) && (
        <dl className="mt-gutter grid gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding text-body-staff shadow-card-soft sm:grid-cols-3">
          {formattedAddress ? (
            <div className="flex items-start gap-2">
              <span
                aria-hidden
                className="material-symbols-outlined mt-0.5 text-[18px] text-primary"
              >
                map
              </span>
              <div className="flex flex-col">
                <dt className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  Address
                </dt>
                <dd>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${formattedAddress.mapsQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-on-surface hover:text-primary hover:underline"
                    data-testid="location-address-link"
                  >
                    {formattedAddress.display}
                  </a>
                </dd>
              </div>
            </div>
          ) : null}
          {phone ? (
            <div className="flex items-start gap-2">
              <span
                aria-hidden
                className="material-symbols-outlined mt-0.5 text-[18px] text-primary"
              >
                call
              </span>
              <div className="flex flex-col">
                <dt className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  Phone
                </dt>
                <dd>
                  <a
                    href={`tel:${phone.replace(/\s+/g, '')}`}
                    className="text-on-surface hover:text-primary hover:underline"
                    data-testid="location-phone-link"
                  >
                    {phone}
                  </a>
                </dd>
              </div>
            </div>
          ) : null}
          {status && status.todayIntervals.length > 0 ? (
            <div className="flex items-start gap-2">
              <span
                aria-hidden
                className="material-symbols-outlined mt-0.5 text-[18px] text-primary"
              >
                schedule
              </span>
              <div className="flex flex-col">
                <dt className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                  Today
                </dt>
                <dd className="text-on-surface" data-testid="location-today-hours">
                  {formatDayIntervals(status.todayIntervals)}
                </dd>
              </div>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  );
}
