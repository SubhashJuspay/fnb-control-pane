import { builder } from './builder.js';

export const UserRef = builder.prismaObject('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    // Email is exposed without an auth scope because every path that
    // returns a User is already gated upstream:
    //   - viewer.memberships[].user (authenticated viewer)
    //   - tenantMembers[].node.user (admin scope)
    //   - acceptInvitation (token-bearing caller, who already typed this email)
    // Adding `authenticated: true` here would break the token-only
    // accept-invitation flow because the caller is anonymous at field-eval
    // time. See accept-invitation.ts.
    email: t.exposeString('email'),
    name: t.exposeString('name', { nullable: true }),
    image: t.exposeString('image', { nullable: true }),
    mfaEnabled: t.exposeBoolean('mfaEnabled'),
  }),
});
