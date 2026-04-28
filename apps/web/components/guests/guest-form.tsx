'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  type CreateGuestInput,
  type UpdateGuestInput,
} from '@repo/validation/guest';
import { Button, Input, Label } from '@repo/ui';

// Form-level Zod schema. We only validate field-level rules at form submit;
// `id` is injected by the wrapper before calling the GraphQL mutation, so we
// can share the same schema across create and update modes.
const guestFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().max(40).optional(),
  email: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v.length === 0 || /\S+@\S+\.\S+/.test(v), 'Invalid email')
    .optional(),
  notes: z.string().trim().max(500).optional(),
});

export interface GuestFormValues {
  name: string;
  phone: string;
  email: string;
  notes: string;
}

interface GuestFormPropsBase {
  initial?: Partial<GuestFormValues>;
  submitLabel?: string;
  onCancel?: () => void;
  submitting?: boolean;
}

interface GuestFormCreateProps extends GuestFormPropsBase {
  mode: 'create';
  onSubmit: (values: CreateGuestInput) => void | Promise<void>;
}

interface GuestFormUpdateProps extends GuestFormPropsBase {
  mode: 'update';
  guestId: string;
  onSubmit: (values: UpdateGuestInput) => void | Promise<void>;
}

export type GuestFormProps = GuestFormCreateProps | GuestFormUpdateProps;

const EMPTY: GuestFormValues = { name: '', phone: '', email: '', notes: '' };

/**
 * Shared guest form used by `<NewGuestDialog>` and `<GuestDetail>`. The two
 * modes differ only in which Zod schema validates the values and the shape
 * of the payload threaded into `onSubmit` — both surfaces want the same
 * four input fields so we keep a single component.
 */
export function GuestForm(props: GuestFormProps): React.JSX.Element {
  const initial = { ...EMPTY, ...(props.initial ?? {}) };
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GuestFormValues>({
    defaultValues: initial,
    resolver: zodResolver(guestFormSchema),
  });

  const onValid = handleSubmit(async (values) => {
    const trim = (s: string): string => s.trim();
    const phone = trim(values.phone);
    const email = trim(values.email);
    const notes = trim(values.notes);
    if (props.mode === 'create') {
      await props.onSubmit({
        name: trim(values.name),
        phone: phone.length > 0 ? phone : null,
        email: email.length > 0 ? email : null,
        notes: notes.length > 0 ? notes : null,
      });
    } else {
      await props.onSubmit({
        id: props.guestId,
        name: trim(values.name),
        phone: phone.length > 0 ? phone : null,
        email: email.length > 0 ? email : null,
        notes: notes.length > 0 ? notes : null,
      });
    }
  });

  const submitting = props.submitting ?? isSubmitting;

  return (
    <form onSubmit={onValid} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="guest-name">Name</Label>
        <Input id="guest-name" {...register('name')} data-input="name" />
        {errors.name ? (
          <p className="text-xs text-destructive">{errors.name.message}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="guest-phone">Phone</Label>
        <Input id="guest-phone" {...register('phone')} data-input="phone" />
        {errors.phone ? (
          <p className="text-xs text-destructive">{errors.phone.message}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="guest-email">Email</Label>
        <Input id="guest-email" {...register('email')} data-input="email" />
        {errors.email ? (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="guest-notes">Notes</Label>
        <Input id="guest-notes" {...register('notes')} data-input="notes" />
        {errors.notes ? (
          <p className="text-xs text-destructive">{errors.notes.message}</p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        {props.onCancel ? (
          <Button
            type="button"
            variant="outline"
            onClick={props.onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting} data-action="submit">
          {props.submitLabel ?? (props.mode === 'create' ? 'Create guest' : 'Save changes')}
        </Button>
      </div>
    </form>
  );
}
