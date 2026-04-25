'use client';

import { useEffect } from 'react';
import {
  useForm,
  Controller,
  type Resolver,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'urql';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  cn,
} from '@repo/ui';
import { inviteStaffSchema } from '@repo/validation/invitation';
import { toast } from 'sonner';
import {
  AdminInviteStaffDocument,
  Role,
} from '@/lib/graphql/generated/graphql';

export interface InviteMemberLocation {
  id: string;
  name: string;
}

export interface InviteMemberDialogProps {
  locations: InviteMemberLocation[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface FormValues {
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER';
  locationId: string | null;
}

const ROLE_OPTIONS: FormValues['role'][] = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'STAFF',
  'VIEWER',
];

const TENANT_WIDE_ROLES = new Set(['OWNER', 'ADMIN']);
const LOCATION_SCOPED_ROLES = new Set(['MANAGER', 'STAFF']);

export interface InviteMemberFormProps {
  locations: InviteMemberLocation[];
  onSubmit: (values: FormValues) => Promise<void> | void;
  onCancel: () => void;
  pending: boolean;
}

/**
 * Pure invitation form. Pulled out of the Dialog wrapper so the form's
 * validation flow is unit-testable in jsdom — Radix's portal + animation
 * dance interferes with react-hook-form's re-render loop in tests.
 *
 * Uses native <select> elements (not radix Select) so the form is fully
 * testable without portal/listbox interaction gymnastics.
 */
export function InviteMemberForm({
  locations,
  onSubmit: onSubmitProp,
  onCancel,
  pending,
}: InviteMemberFormProps): React.JSX.Element {
  const form = useForm<FormValues>({
    resolver: zodResolver(inviteStaffSchema) as Resolver<FormValues>,
    defaultValues: { email: '', role: 'STAFF', locationId: null },
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    shouldUnregister: false,
  });
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState,
  } = form;
  const { errors } = formState;
  const role = watch('role');
  const isTenantWide = TENANT_WIDE_ROLES.has(role);

  // Whenever the role flips between tenant-wide and location-scoped, force
  // locationId to a sensible default so the cross-field rule can pass.
  useEffect(() => {
    if (isTenantWide) {
      setValue('locationId', null, { shouldValidate: false });
    }
  }, [isTenantWide, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    await onSubmitProp(values);
  });

  return (
    <form className="grid gap-4" onSubmit={onSubmit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          autoComplete="email"
          {...register('email')}
          aria-invalid={Boolean(errors.email)}
        />
        {errors.email ? (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          {...register('role')}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {isTenantWide
            ? 'OWNER and ADMIN apply tenant-wide.'
            : LOCATION_SCOPED_ROLES.has(role)
              ? 'MANAGER and STAFF must be scoped to a location.'
              : 'VIEWER may be tenant-wide or location-scoped.'}
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invite-location">Location</Label>
        <Controller
          control={control}
          name="locationId"
          render={({ field, fieldState }) => (
            <select
              id="invite-location"
              className={cn(
                'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
              )}
              disabled={isTenantWide}
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value || null)}
              onBlur={field.onBlur}
              ref={field.ref}
              name={field.name}
              aria-invalid={fieldState.invalid ? 'true' : 'false'}
            >
              <option value="">
                {isTenantWide ? 'Tenant-wide (no location)' : 'Select a location…'}
              </option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          )}
        />
        {errors.locationId ? (
          <p className="text-sm text-destructive" role="alert">
            {errors.locationId.message}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Sending…' : 'Send invite'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Dialog wrapper around <InviteMemberForm/>. Owns the urql mutation, toast,
 * and dialog open-state coordination.
 */
export function InviteMemberDialog({
  locations,
  open,
  onOpenChange,
  onCreated,
}: InviteMemberDialogProps): React.JSX.Element {
  const [{ fetching }, inviteStaff] = useMutation(AdminInviteStaffDocument);

  const handleSubmit = async (values: FormValues): Promise<void> => {
    const result = await inviteStaff({
      input: {
        email: values.email,
        role: values.role as Role,
        locationId: values.locationId ?? null,
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Invitation sent');
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Send an invitation email. The recipient will set their password
            after accepting.
          </DialogDescription>
        </DialogHeader>
        <InviteMemberForm
          key={open ? 'open' : 'closed'}
          locations={locations}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          pending={fetching}
        />
      </DialogContent>
    </Dialog>
  );
}
