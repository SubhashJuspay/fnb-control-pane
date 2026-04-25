import { z } from 'zod';
import { emailSchema } from './auth.js';
import { roleSchema } from './membership.js';

export const inviteStaffSchema = z
  .object({
    email: emailSchema,
    role: roleSchema,
    locationId: z.string().uuid().nullable().default(null),
  })
  .refine(
    (data) => {
      // OWNER and ADMIN must be tenant-wide (locationId null)
      if ((data.role === 'OWNER' || data.role === 'ADMIN') && data.locationId !== null) {
        return false;
      }
      // MANAGER, STAFF must have a locationId
      if ((data.role === 'MANAGER' || data.role === 'STAFF') && data.locationId === null) {
        return false;
      }
      return true;
    },
    {
      message:
        'OWNER/ADMIN must not be scoped to a location; MANAGER/STAFF must be scoped to a location.',
      path: ['locationId'],
    },
  );
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(32),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
