import { describe, expect, it } from 'vitest';
import { inviteStaffSchema } from '@repo/validation/invitation';

describe('inviteStaffSchema cross-field rule', () => {
  it('rejects STAFF without a location', () => {
    const result = inviteStaffSchema.safeParse({
      email: 'a@b.com',
      role: 'STAFF',
      locationId: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'locationId');
      expect(issue?.message).toMatch(/must be scoped to a location/i);
    }
  });

  it('rejects OWNER scoped to a location', () => {
    const result = inviteStaffSchema.safeParse({
      email: 'a@b.com',
      role: 'OWNER',
      locationId: '00000000-0000-4000-a000-000000000001',
    });
    expect(result.success).toBe(false);
  });

  it('accepts STAFF with a location', () => {
    const result = inviteStaffSchema.safeParse({
      email: 'a@b.com',
      role: 'STAFF',
      locationId: '00000000-0000-4000-a000-000000000001',
    });
    expect(result.success).toBe(true);
  });
});
