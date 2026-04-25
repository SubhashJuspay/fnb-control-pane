import { builder } from './builder.js';
import { LocationStatusEnum } from './enums.js';

export const LocationRef = builder.prismaObject('Location', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    slug: t.exposeString('slug'),
    timezone: t.exposeString('timezone'),
    currency: t.exposeString('currency'),
    locale: t.exposeString('locale'),
    businessDayCutoff: t.exposeString('businessDayCutoff'),
    status: t.field({
      type: LocationStatusEnum,
      resolve: (parent) => parent.status,
    }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    tenant: t.relation('tenant', { authScopes: { authenticated: true } }),
  }),
});
