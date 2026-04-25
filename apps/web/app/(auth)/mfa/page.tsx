import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui';
import { MfaForm } from './mfa-form';

export default function MfaPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
        <CardDescription>
          Enter the 6-digit code from your authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MfaForm />
      </CardContent>
    </Card>
  );
}
