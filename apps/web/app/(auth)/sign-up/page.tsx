import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui';
import { SignUpTenantForm } from './sign-up-tenant-form';

export const metadata = {
  title: 'Sign up — F&B Control Pane',
};

export default function SignUpPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up your restaurant</CardTitle>
        <CardDescription>
          Create your tenant, your first location, and the owner account in one
          step. Already invited? Use the link in your invite email instead.{' '}
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpTenantForm />
      </CardContent>
    </Card>
  );
}
