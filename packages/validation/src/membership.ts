import { z } from 'zod';

export const roleSchema = z.enum(['OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'VIEWER']);
export type RoleInput = z.infer<typeof roleSchema>;

export const updateMembershipRoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: roleSchema,
});
export type UpdateMembershipRoleInput = z.infer<typeof updateMembershipRoleSchema>;

export const revokeMembershipSchema = z.object({
  membershipId: z.string().uuid(),
});
export type RevokeMembershipInput = z.infer<typeof revokeMembershipSchema>;
