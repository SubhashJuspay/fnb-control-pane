'use server';

import { acceptInvitationSchema } from '@repo/validation/invitation';
import { signIn } from '@/lib/auth';
import { serverFetch } from '@/lib/graphql/server';

export interface AcceptInvitationActionResult {
  error?: string;
  redirectTo?: string;
}

const ACCEPT_INVITATION_MUTATION = /* GraphQL */ `
  mutation AcceptInvitation($input: AcceptInvitationInput!) {
    acceptInvitation(input: $input) {
      id
      email
      name
    }
  }
`;

interface AcceptInvitationData {
  acceptInvitation: { id: string; email: string; name: string | null };
}

export async function acceptInvitationAction(input: {
  token: string;
  name: string;
  password: string;
}): Promise<AcceptInvitationActionResult> {
  const parsed = acceptInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }
  const result = await serverFetch<AcceptInvitationData>({
    query: ACCEPT_INVITATION_MUTATION,
    variables: { input: parsed.data },
  });
  if (result.errors?.length) {
    return { error: result.errors[0]?.message ?? 'Could not accept invitation.' };
  }
  const email = result.data?.acceptInvitation.email;
  if (!email) {
    return { error: 'Could not complete sign-up.' };
  }
  try {
    await signIn('credentials', {
      email,
      password: parsed.data.password,
      redirect: false,
    });
    return { redirectTo: '/' };
  } catch {
    // Fall back to the sign-in page if auto-login somehow fails.
    return { redirectTo: '/sign-in' };
  }
}
