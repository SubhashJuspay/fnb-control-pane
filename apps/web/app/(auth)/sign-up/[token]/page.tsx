import { notFound } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui';
import { serverFetch } from '@/lib/graphql/server';
import { SignUpForm } from './sign-up-form';

interface InvitationData {
  invitationByToken: {
    id: string;
    email: string;
    role: string;
    tenantName: string;
    locationName: string | null;
    expiresAt: string;
    acceptedAt: string | null;
  } | null;
}

const INVITATION_BY_TOKEN_QUERY = /* GraphQL */ `
  query InvitationByToken($token: String!) {
    invitationByToken(token: $token) {
      id
      email
      role
      tenantName
      locationName
      expiresAt
      acceptedAt
    }
  }
`;

interface AcceptInvitationPageProps {
  params: Promise<{ token: string }>;
}

export default async function AcceptInvitationPage({
  params,
}: AcceptInvitationPageProps) {
  const { token } = await params;
  const result = await serverFetch<InvitationData>({
    query: INVITATION_BY_TOKEN_QUERY,
    variables: { token },
  });
  const invitation = result.data?.invitationByToken;
  if (!invitation) notFound();

  if (invitation.acceptedAt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitation already used</CardTitle>
          <CardDescription>
            This invitation has already been accepted.{' '}
            <a href="/sign-in" className="underline">
              Sign in
            </a>{' '}
            instead.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (new Date(invitation.expiresAt) < new Date()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitation expired</CardTitle>
          <CardDescription>
            Ask your administrator to send a new one.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join {invitation.tenantName}</CardTitle>
        <CardDescription>
          You&apos;re being invited as <strong>{invitation.role}</strong>
          {invitation.locationName ? (
            <>
              {' '}
              at <strong>{invitation.locationName}</strong>
            </>
          ) : null}
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm token={token} email={invitation.email} />
      </CardContent>
    </Card>
  );
}
