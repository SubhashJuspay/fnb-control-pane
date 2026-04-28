import { redirect } from 'next/navigation';
import { headers as nextHeaders } from 'next/headers';
import { TicketsTable } from '@/components/tickets/tickets-table';
import type { ServerOption } from '@/components/tickets/tickets-filters';
import { defaultFilterValues } from '@/components/tickets/tickets-table';
import { TicketStatus } from '@/lib/graphql/generated/graphql';
import { serverFetch } from '@/lib/graphql/server';
import { loadAppShellData } from '@/lib/viewer';

const MEMBERS_QUERY = /* GraphQL */ `
  query TicketsServersList($first: Int) {
    tenantMembers(first: $first) {
      edges {
        node {
          id
          status
          user {
            id
            name
            email
          }
        }
      }
    }
  }
`;

interface MembersResponse {
  tenantMembers: {
    edges: Array<{
      node: {
        id: string;
        status: string | null;
        user: { id: string; name: string | null; email: string | null } | null;
      } | null;
    } | null> | null;
  } | null;
}

/**
 * Loads a list of users to use as the "Server" filter dropdown. Requires
 * admin scope on the api, so we degrade to an empty list when the viewer
 * is only a manager — they'll still get a working filter panel without
 * the server picker. The query is server-side via the internal proxy so
 * it never round-trips to the browser.
 */
async function loadServers(tenantSlug: string): Promise<ServerOption[]> {
  try {
    const cookie = (await nextHeaders()).get('cookie') ?? '';
    const result = await serverFetch<MembersResponse>({
      query: MEMBERS_QUERY,
      variables: { first: 100 },
      headers: { cookie, 'x-tenant-slug': tenantSlug },
    });
    if (!result.data?.tenantMembers?.edges) return [];
    const seen = new Set<string>();
    const out: ServerOption[] = [];
    for (const edge of result.data.tenantMembers.edges) {
      const user = edge?.node?.user;
      if (!user?.id || seen.has(user.id)) continue;
      seen.add(user.id);
      out.push({ id: user.id, name: user.name ?? user.email ?? '—' });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export default async function TicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
  searchParams: Promise<{ from?: string; to?: string; status?: string; serverId?: string }>;
}) {
  const { tenantSlug, locationSlug } = await params;
  const sp = await searchParams;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');

  const defaults = defaultFilterValues();
  const initialFilters = {
    fromDate: sp.from ?? defaults.fromDate,
    toDate: sp.to ?? defaults.toDate,
    status: ((): typeof defaults.status => {
      const s = sp.status;
      if (s === TicketStatus.Open || s === TicketStatus.Closed || s === TicketStatus.Voided) {
        return s;
      }
      return 'ALL';
    })(),
    serverId: sp.serverId ?? 'ALL',
  };

  const servers = await loadServers(tenantSlug);

  return (
    <TicketsTable
      tenantSlug={tenantSlug}
      locationSlug={locationSlug}
      servers={servers}
      initialFilters={initialFilters}
    />
  );
}
