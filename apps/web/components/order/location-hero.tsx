'use client';

import { useEffect, useState } from 'react';
import { Clock, MapPin, Phone, ShoppingBag } from 'lucide-react';
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
  const parts = [a.line1, a.line2, a.city, a.region, a.postalCode, a.country]
    .filter((p): p is string => Boolean(p));
  if (parts.length === 0) return null;
  return {
    display: parts.join(', '),
    mapsQuery: encodeURIComponent(parts.join(', ')),
  };
}

export function LocationHero(props: LocationHeroProps): React.JSX.Element {
  const { tenantName, locationName, currency, timezone, phone, address, openingHours } =
    props;
  const hours = parseOpeningHours(openingHours);
  const formattedAddress = formatAddress(address);

  // Recompute open/closed every minute so the badge stays honest.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const status = hours
    ? computeOpenStatus(hours, timezone, now)
    : null;

  return (
    <section
      aria-label="Welcome"
      className="mb-5 flex flex-col gap-3 rounded-xl border bg-gradient-to-br from-primary/5 via-background to-background p-5"
      data-testid="location-hero"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold leading-tight">{tenantName}</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden />
            {locationName}
          </p>
        </div>
        <span className="shrink-0 rounded-full border bg-background px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {currency}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
          <ShoppingBag className="size-3" aria-hidden />
          Pickup
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 font-medium text-muted-foreground">
          <Clock className="size-3" aria-hidden />
          Pay on pickup
        </span>
        {status ? (
          <span
            data-testid="location-open-status"
            data-open={status.isOpen ? 'true' : 'false'}
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
              status.isOpen
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200',
            ].join(' ')}
          >
            <span
              aria-hidden
              className={[
                'inline-block size-1.5 rounded-full',
                status.isOpen ? 'bg-emerald-500' : 'bg-rose-500',
              ].join(' ')}
            />
            {status.isOpen
              ? status.closesAt
                ? `Open • closes ${formatHM(status.closesAt)}`
                : 'Open'
              : status.reopensAt
                ? status.reopensAt.relative === 'today'
                  ? `Closed • opens ${formatHM(status.reopensAt.time)}`
                  : status.reopensAt.relative === 'tomorrow'
                    ? `Closed • opens tomorrow ${formatHM(status.reopensAt.time)}`
                    : `Closed • opens ${formatHM(status.reopensAt.time)}`
                : 'Closed'}
          </span>
        ) : null}
      </div>

      {(formattedAddress || phone || (status && status.todayIntervals.length > 0)) && (
        <dl className="grid gap-1.5 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-3">
          {formattedAddress ? (
            <>
              <dt className="text-muted-foreground">Address</dt>
              <dd>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${formattedAddress.mapsQuery}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline-offset-2 hover:underline"
                  data-testid="location-address-link"
                >
                  {formattedAddress.display}
                </a>
              </dd>
            </>
          ) : null}
          {phone ? (
            <>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>
                <a
                  href={`tel:${phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
                  data-testid="location-phone-link"
                >
                  <Phone className="size-3" aria-hidden />
                  {phone}
                </a>
              </dd>
            </>
          ) : null}
          {status && status.todayIntervals.length > 0 ? (
            <>
              <dt className="text-muted-foreground">Today</dt>
              <dd className="text-foreground" data-testid="location-today-hours">
                {formatDayIntervals(status.todayIntervals)}
              </dd>
            </>
          ) : null}
        </dl>
      )}
    </section>
  );
}
