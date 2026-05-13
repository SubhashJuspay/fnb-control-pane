import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { SignInForm } from './sign-in-form';

interface SignInPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  const params = await searchParams;
  if (session?.user) redirect(params.next ?? '/');
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-loose shadow-card-soft">
      <div className="mb-stack-loose">
        <h2 className="mb-2 font-display text-display-lg font-bold text-on-background">
          Sign in
        </h2>
        <p className="text-body-staff text-on-surface-variant">
          Welcome back. Enter your credentials to continue.
        </p>
      </div>
      <SignInForm next={params.next} error={params.error} />
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-outline-variant" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-surface-container-lowest px-2 font-label-caps text-label-caps tracking-widest text-on-surface-variant">
            Staff only access
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-body-staff text-on-surface-variant">
          Need technical assistance?{' '}
          <Link href="/forgot-password" className="font-bold text-primary hover:underline">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
