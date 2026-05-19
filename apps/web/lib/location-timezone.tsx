'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * The active location's clock — IANA timezone plus business-day cutoff
 * ("HH:MM" local). Defaults to UTC + 00:00 so consumers that mount
 * outside a location-scoped layout still get a coherent value.
 *
 * The dashboard's "today" range must be computed against the location's
 * *business day*, not the viewer's calendar day:
 *
 *   - A viewer in IST opening a US-Pacific location's dashboard sees a
 *     browser calendar day that's already ahead of the location's day.
 *   - Even within the location's timezone, the early-morning hours (e.g.
 *     02:00 local with a 04:00 cutoff) still belong to the *previous*
 *     business day. Treating them as the current calendar day puts
 *     freshly-closed tickets outside the requested window and the
 *     dashboard reads zeros.
 */
export interface LocationClock {
  /** IANA timezone, e.g. `America/Los_Angeles`. */
  timezone: string;
  /** Local time at which a new business day starts, `HH:MM`. */
  businessDayCutoff: string;
}

const DEFAULT_CLOCK: LocationClock = {
  timezone: 'UTC',
  businessDayCutoff: '00:00',
};

export const LocationTimezoneContext = createContext<LocationClock>(DEFAULT_CLOCK);

/** Convenience reader for callers that only need the timezone string. */
export function useLocationTimezone(): string {
  return useContext(LocationTimezoneContext).timezone;
}

/** Full clock — for callers that need both timezone + cutoff. */
export function useLocationClock(): LocationClock {
  return useContext(LocationTimezoneContext);
}

export function LocationTimezoneProvider({
  timezone,
  businessDayCutoff,
  children,
}: {
  timezone: string;
  businessDayCutoff: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <LocationTimezoneContext.Provider value={{ timezone, businessDayCutoff }}>
      {children}
    </LocationTimezoneContext.Provider>
  );
}
