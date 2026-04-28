import type { PrismaClient } from '@repo/db';

export async function ensureSystemUser(
  prisma: PrismaClient,
  tenantId: string,
  tenantSlug: string,
): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { systemUserId: true },
  });
  if (tenant?.systemUserId) return tenant.systemUserId;
  const email = `system+${tenantId.slice(0, 8)}@${tenantSlug}.fnb.local`;
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: 'System (Online Orders)', status: 'DISABLED' },
    select: { id: true },
  });
  await prisma.tenant.update({ where: { id: tenantId }, data: { systemUserId: user.id } });
  return user.id;
}
