import { builder } from './builder.js';

export const UserRef = builder.prismaObject('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    email: t.exposeString('email', {
      authScopes: { authenticated: true },
    }),
    name: t.exposeString('name', { nullable: true }),
    image: t.exposeString('image', { nullable: true }),
    mfaEnabled: t.exposeBoolean('mfaEnabled'),
  }),
});
