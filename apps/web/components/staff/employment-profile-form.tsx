'use client';

import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  cn,
  DialogFooter,
  Input,
  Label,
  MoneyInput,
} from '@repo/ui';
import { upsertEmploymentProfileSchema } from '@repo/validation/staff';
import { z } from 'zod';

const formSchema = z.object({
  userId: z.string().uuid(),
  locationId: z.string().uuid(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACTOR']),
  hourlyRateCents: z.number().int().min(0).nullable(),
  hireDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a hire date'),
  terminationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a termination date')
    .nullable(),
  notes: z.string().max(1000).nullable(),
});

export type EmploymentProfileFormValues = z.infer<typeof formSchema>;

void upsertEmploymentProfileSchema;

export interface EmploymentProfileFormUser {
  id: string;
  name: string | null;
  email: string | null;
}

export interface EmploymentProfileFormLocation {
  id: string;
  name: string;
  currency: string;
}

export interface EmploymentProfileFormProps {
  mode: 'create' | 'edit';
  users: EmploymentProfileFormUser[];
  locations: EmploymentProfileFormLocation[];
  initial?: EmploymentProfileFormValues;
  onSubmit: (values: EmploymentProfileFormValues) => Promise<void>;
  onCancel: () => void;
}

const DEFAULTS: EmploymentProfileFormValues = {
  userId: '',
  locationId: '',
  employmentType: 'FULL_TIME',
  hourlyRateCents: null,
  hireDate: new Date().toISOString().slice(0, 10),
  terminationDate: null,
  notes: null,
};

export function EmploymentProfileForm({
  mode,
  users,
  locations,
  initial,
  onSubmit: onSubmitProp,
  onCancel,
}: EmploymentProfileFormProps): React.JSX.Element {
  const form = useForm<EmploymentProfileFormValues>({
    resolver: zodResolver(formSchema) as Resolver<EmploymentProfileFormValues>,
    defaultValues: initial ?? DEFAULTS,
    mode: 'onSubmit',
  });
  const { register, control, handleSubmit, formState, watch } = form;
  const onSubmit = handleSubmit(async (values) => {
    await onSubmitProp(values);
  });
  const selectClassName = cn(
    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:cursor-not-allowed disabled:opacity-50',
  );
  const locationId = watch('locationId');
  const currency =
    locations.find((l) => l.id === locationId)?.currency ?? 'USD';

  return (
    <form className="grid gap-4" onSubmit={onSubmit} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="employment-user">Member</Label>
        <Controller
          control={control}
          name="userId"
          render={({ field, fieldState }) => (
            <select
              id="employment-user"
              className={selectClassName}
              disabled={mode === 'edit'}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
              ref={field.ref}
              name={field.name}
              aria-invalid={fieldState.invalid ? 'true' : 'false'}
            >
              <option value="">Select a member…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email ?? u.id}
                </option>
              ))}
            </select>
          )}
        />
        {formState.errors.userId ? (
          <p className="text-sm text-destructive">
            {formState.errors.userId.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="employment-location">Location</Label>
        <Controller
          control={control}
          name="locationId"
          render={({ field, fieldState }) => (
            <select
              id="employment-location"
              className={selectClassName}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
              ref={field.ref}
              name={field.name}
              aria-invalid={fieldState.invalid ? 'true' : 'false'}
            >
              <option value="">Select a location…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        />
        {formState.errors.locationId ? (
          <p className="text-sm text-destructive">
            {formState.errors.locationId.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="employment-type">Employment type</Label>
        <select
          id="employment-type"
          className={selectClassName}
          {...register('employmentType')}
        >
          <option value="FULL_TIME">Full-time</option>
          <option value="PART_TIME">Part-time</option>
          <option value="CONTRACTOR">Contractor</option>
        </select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="employment-hourly">Hourly rate ({currency})</Label>
        <Controller
          control={control}
          name="hourlyRateCents"
          render={({ field }) => (
            <MoneyInput
              id="employment-hourly"
              value={field.value}
              onChange={(c) => field.onChange(c)}
            />
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label htmlFor="employment-hire">Hire date</Label>
          <Input
            id="employment-hire"
            type="date"
            {...register('hireDate')}
            aria-invalid={Boolean(formState.errors.hireDate)}
          />
          {formState.errors.hireDate ? (
            <p className="text-sm text-destructive">
              {formState.errors.hireDate.message}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="employment-term">Termination date</Label>
          <Controller
            control={control}
            name="terminationDate"
            render={({ field }) => (
              <Input
                id="employment-term"
                type="date"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value || null)}
                onBlur={field.onBlur}
                ref={field.ref}
                name={field.name}
              />
            )}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="employment-notes">Notes</Label>
        <Controller
          control={control}
          name="notes"
          render={({ field }) => (
            <Input
              id="employment-notes"
              placeholder="Optional"
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value || null)}
              onBlur={field.onBlur}
              ref={field.ref}
              name={field.name}
            />
          )}
        />
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={formState.isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}
