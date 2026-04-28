'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'urql';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button, Input, Label } from '@repo/ui';
import { AddWalkinDocument } from '@/lib/graphql/generated/graphql';

const formSchema = z.object({
  guestName: z.string().trim().min(1, 'Required').max(120),
  partySize: z.coerce.number().int().min(1).max(40),
  notes: z.string().trim().max(500).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddWalkinFormProps {
  onAdded: () => void;
}

export function AddWalkinForm({ onAdded }: AddWalkinFormProps): React.JSX.Element {
  const [, addWalkin] = useMutation(AddWalkinDocument);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { partySize: 2 },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await addWalkin({
      input: {
        guestName: values.guestName,
        partySize: values.partySize,
        notes: values.notes || null,
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    reset({ partySize: 2 });
    onAdded();
  });

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3 rounded-md border p-3"
      data-add-walkin-form
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="walkin-guestName">Guest name</Label>
        <Input
          id="walkin-guestName"
          {...register('guestName')}
          data-input="walkin-guestName"
        />
        {errors.guestName ? (
          <p className="text-xs text-destructive">{errors.guestName.message}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="walkin-partySize">Party</Label>
        <Input
          id="walkin-partySize"
          type="number"
          min={1}
          max={40}
          className="w-20"
          {...register('partySize')}
          data-input="walkin-partySize"
        />
        {errors.partySize ? (
          <p className="text-xs text-destructive">{errors.partySize.message}</p>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="walkin-notes">Notes</Label>
        <Input id="walkin-notes" {...register('notes')} data-input="walkin-notes" />
      </div>
      <Button type="submit" disabled={isSubmitting} data-action="add-walkin">
        Add walk-in
      </Button>
    </form>
  );
}
