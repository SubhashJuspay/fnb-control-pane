import { describe, expect, it, vi } from 'vitest';
import { resolvePublicLocationBySlug } from './public-location.js';

describe('resolvePublicLocationBySlug', () => {
  it('returns null when tenant missing', async () => {
    const prisma = {
      tenant: { findUnique: vi.fn().mockResolvedValue(null) },
      location: { findFirst: vi.fn() },
    };
    const out = await resolvePublicLocationBySlug(
      prisma as never,
      'acme',
      'mission-st',
    );
    expect(out).toBeNull();
  });

  it('returns null when tenant suspended', async () => {
    const prisma = {
      tenant: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 't', name: 'Acme', status: 'SUSPENDED' }),
      },
      location: { findFirst: vi.fn() },
    };
    const out = await resolvePublicLocationBySlug(
      prisma as never,
      'acme',
      'mission-st',
    );
    expect(out).toBeNull();
  });

  it('returns null when location missing', async () => {
    const prisma = {
      tenant: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 't', name: 'Acme', status: 'ACTIVE' }),
      },
      location: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const out = await resolvePublicLocationBySlug(
      prisma as never,
      'acme',
      'nope',
    );
    expect(out).toBeNull();
  });

  it('returns sanitized projection on happy path', async () => {
    const prisma = {
      tenant: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: 't', name: 'Acme', status: 'ACTIVE' }),
      },
      location: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'loc',
          name: 'Mission St',
          slug: 'mission-st',
          timezone: 'America/Los_Angeles',
          currency: 'USD',
        }),
      },
    };
    const out = await resolvePublicLocationBySlug(
      prisma as never,
      'acme',
      'mission-st',
    );
    expect(out).toEqual({
      id: 'loc',
      name: 'Mission St',
      slug: 'mission-st',
      timezone: 'America/Los_Angeles',
      currency: 'USD',
      tenantName: 'Acme',
      tenantId: 't',
      locationId: 'loc',
    });
  });
});
