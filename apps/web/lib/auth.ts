import NextAuth, { type NextAuthResult } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@repo/db';
import { signInSchema } from '@repo/validation/auth';
import { verifyPassword } from './password';

export { verifyPassword };

const result = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Auth.js v5 requires `jwt` for the Credentials provider — the database session
  // adapter has never officially supported credentials. Sub-project Wave 3a's
  // verifySession reads the Session table; the Foundation api will need to switch
  // to JWT verification when this app is wired up. See report for migration note.
  session: { strategy: 'jwt' },
  pages: { signIn: '/sign-in' },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds) => {
        const parsed = signInSchema.safeParse(creds);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user?.passwordHash) return null;
        if (user.status !== 'ACTIVE') return null;
        if (!verifyPassword(parsed.data.password, user.passwordHash)) return null;
        return { id: user.id, email: user.email, name: user.name ?? null };
      },
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.sub = user.id;
        if (user.email) token.email = user.email;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

// Explicit type annotations work around Auth.js v5's inferred-type portability
// issue (TS2742) when re-exporting destructured handlers/auth/signIn/signOut.
export const handlers: NextAuthResult['handlers'] = result.handlers;
export const auth: NextAuthResult['auth'] = result.auth;
export const signIn: NextAuthResult['signIn'] = result.signIn;
export const signOut: NextAuthResult['signOut'] = result.signOut;
