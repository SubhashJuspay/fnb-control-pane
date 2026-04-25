import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({
  headers: async () => new Map([['cookie', '']]),
}));

const fetchMock = vi.fn();
vi.mock('./graphql/server', () => ({
  serverFetch: (...args: unknown[]) => fetchMock(...args),
}));

import { loadAppShellData } from './viewer';

describe('loadAppShellData', () => {
  beforeEach(() => fetchMock.mockReset());

  it('groups memberships by tenant and dedupes locations', async () => {
    fetchMock.mockResolvedValue({
      data: {
        viewer: {
          id: 'u1',
          email: 'u@test',
          name: 'U',
          memberships: [
            {
              id: 'm1',
              role: 'OWNER',
              tenant: {
                id: 't1',
                slug: 'acme',
                name: 'Acme',
                locations: [{ id: 'l1', slug: 'mission', name: 'Mission' }],
              },
              location: null,
            },
            {
              id: 'm2',
              role: 'STAFF',
              tenant: {
                id: 't1',
                slug: 'acme',
                name: 'Acme',
                locations: [
                  { id: 'l1', slug: 'mission', name: 'Mission' },
                  { id: 'l2', slug: 'soma', name: 'SoMa' },
                ],
              },
              location: { id: 'l1', slug: 'mission', name: 'Mission' },
            },
          ],
        },
      },
    });
    const result = await loadAppShellData();
    expect(result?.tenants).toHaveLength(1);
    const t = result!.tenants[0]!;
    expect(t.locations.map((l) => l.slug).sort()).toEqual(['mission', 'soma']);
    expect(t.role).toBe('OWNER');
    expect(t.isTenantWide).toBe(true);
  });

  it('returns null when viewer query returns no viewer', async () => {
    fetchMock.mockResolvedValue({ data: { viewer: null } });
    expect(await loadAppShellData()).toBeNull();
  });

  it('keeps tenants separate and tracks location-scoped membership', async () => {
    fetchMock.mockResolvedValue({
      data: {
        viewer: {
          id: 'u1',
          email: 'u@test',
          name: 'U',
          memberships: [
            {
              id: 'm1',
              role: 'MANAGER',
              tenant: {
                id: 't1',
                slug: 'acme',
                name: 'Acme',
                locations: [{ id: 'l1', slug: 'mission', name: 'Mission' }],
              },
              location: { id: 'l1', slug: 'mission', name: 'Mission' },
            },
            {
              id: 'm2',
              role: 'STAFF',
              tenant: {
                id: 't2',
                slug: 'beta',
                name: 'Beta',
                locations: [{ id: 'l2', slug: 'hq', name: 'HQ' }],
              },
              location: { id: 'l2', slug: 'hq', name: 'HQ' },
            },
          ],
        },
      },
    });
    const result = await loadAppShellData();
    expect(result?.tenants).toHaveLength(2);
    const acme = result!.tenants.find((t) => t.slug === 'acme')!;
    const beta = result!.tenants.find((t) => t.slug === 'beta')!;
    expect(acme.role).toBe('MANAGER');
    expect(acme.isTenantWide).toBe(false);
    expect(beta.role).toBe('STAFF');
  });
});
