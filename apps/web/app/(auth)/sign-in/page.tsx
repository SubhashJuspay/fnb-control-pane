import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui';
import { SignInForm } from './sign-in-form';

interface SignInPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user) redirect(params.next ?? '/');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Welcome back. Enter your credentials to continue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignInForm next={params.next} error={params.error} />
      </CardContent>
    </Card>
  );
}
