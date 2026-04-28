import { headers as nextHeaders } from 'next/headers';
import { serverFetch } from './graphql/server';

const VIEWER_QUERY = /* GraphQL */ `
  query AppShellViewer {
    viewer {
      id
      email
      name
      memberships {
        id
        role
        tenant {
          id
          slug
          name
          locations {
            id
            slug
            name
            currency
            timezone
          }
        }
        location {
          id
          slug
          name
        }
      }
    }
  }
`;

export interface AppShellLocation {
  id: string;
  slug: string;
  name: string;
  /** ISO 4217 code; defaults to 'USD' if upstream returned null. */
  currency: string;
  /** IANA timezone, e.g. 'America/Los_Angeles'. Defaults to UTC if upstream returned null. */
  timezone: string;
}

export interface AppShellTenant {
  id: string;
  slug: string;
  name: string;
  locations: AppShellLocation[];
  /** Highest role across the viewer's memberships in this tenant. */
  role: string;
  /** True if at least one membership in this tenant has `location: null`. */
  isTenantWide: boolean;
}

export interface AppShellViewer {
  id: string;
  email: string;
  name: string | null;
}

export interface AppShellData {
  viewer: AppShellViewer;
  tenants: AppShellTenant[];
}

interface RawMembership {
  id: string;
  role: string;
  tenant: {
    id: string;
    slug: string;
    name: string;
    locations: Array<{
      id: string;
      slug: string;
      name: string;
      currency: string | null;
      timezone: string | null;
    }>;
  };
  location: { id: string; slug: string; name: string } | null;
}

interface RawViewer {
  id: string;
  email: string;
  name: string | null;
  memberships: RawMembership[];
}

interface RawViewerResponse {
  viewer: RawViewer | null;
}

const ROLE_RANKS = ['VIEWER', 'STAFF', 'MANAGER', 'ADMIN', 'OWNER'] as const;

function compareRole(a: string, b: string): number {
  return (
    ROLE_RANKS.indexOf(a as (typeof ROLE_RANKS)[number]) -
    ROLE_RANKS.indexOf(b as (typeof ROLE_RANKS)[number])
  );
}

/**
 * Server-side helper that loads the viewer + the tenant/location tree the
 * authenticated app shell needs for sidebar, location switcher, and route
 * guards. Returns `null` when there is no signed-in viewer.
 *
 * Memberships are grouped by tenant; locations across all memberships for the
 * same tenant are unioned (the api's `Tenant.locations` field is already
 * viewer-scoped, so it returns either all locations for tenant-wide users or
 * just the location-scoped subset). Roles are reduced to the strongest one.
 */
export async function loadAppShellData(): Promise<AppShellData | null> {
  const cookie = (await nextHeaders()).get('cookie') ?? '';
  const result = await serverFetch<RawViewerResponse>({
    query: VIEWER_QUERY,
    headers: { cookie },
  });
  if (!result.data?.viewer) return null;
  const viewer = result.data.viewer;

  const byTenant = new Map<string, AppShellTenant>();
  for (const membership of viewer.memberships) {
    let tenant = byTenant.get(membership.tenant.id);
    if (!tenant) {
      tenant = {
        id: membership.tenant.id,
        slug: membership.tenant.slug,
        name: membership.tenant.name,
        locations: [],
        role: membership.role,
        isTenantWide: false,
      };
      byTenant.set(membership.tenant.id, tenant);
    }
    if (membership.location === null) {
      tenant.isTenantWide = true;
    }
    if (compareRole(membership.role, tenant.role) > 0) {
      tenant.role = membership.role;
    }
    // Union locations from `tenant.locations` (the api scopes this to the
    // viewer, so it's already correct per-membership). Dedupe by id.
    const seen = new Set(tenant.locations.map((l) => l.id));
    for (const loc of membership.tenant.locations) {
      if (!seen.has(loc.id)) {
        tenant.locations.push({
          id: loc.id,
          slug: loc.slug,
          name: loc.name,
          currency: loc.currency ?? 'USD',
          timezone: loc.timezone ?? 'UTC',
        });
        seen.add(loc.id);
      }
    }
  }

  // Stable ordering: tenants by name, locations by name (already sorted from
  // api but keep deterministic after merging).
  const tenants = [...byTenant.values()]
    .map((t) => ({
      ...t,
      locations: [...t.locations].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    viewer: { id: viewer.id, email: viewer.email, name: viewer.name },
    tenants,
  };
}
