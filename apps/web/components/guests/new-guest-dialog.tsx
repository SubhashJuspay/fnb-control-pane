'use client';

import { useMutation } from 'urql';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@repo/ui';
import {
  CreateGuestDocument,
  type CreateGuestMutation,
} from '@/lib/graphql/generated/graphql';
import { GuestForm } from './guest-form';

type CreatedGuest = NonNullable<CreateGuestMutation['createGuest']>;

interface NewGuestDialogProps {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated?: (guest: CreatedGuest) => void;
}

/**
 * Modal that creates a new guest record. Used standalone from the guests
 * list page and from `<GuestPicker>` (when the typeahead has no match and
 * the user picks the "Create new guest with name '<query>'" option). The
 * `initialName` prop pre-fills the name field for the picker case so the
 * user doesn't have to retype.
 */
export function NewGuestDialog({
  open,
  initialName,
  onClose,
  onCreated,
}: NewGuestDialogProps): React.JSX.Element {
  const [, createGuest] = useMutation(CreateGuestDocument);

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New guest</DialogTitle>
          <DialogDescription>
            Add a new guest. Phone, email, and notes are optional.
          </DialogDescription>
        </DialogHeader>
        <GuestForm
          mode="create"
          initial={initialName ? { name: initialName } : undefined}
          onCancel={onClose}
          onSubmit={async (values) => {
            const result = await createGuest({ input: values });
            if (result.error) {
              toast.error(result.error.message);
              return;
            }
            const guest = result.data?.createGuest;
            if (!guest) return;
            toast.success(`Created ${guest.name}`);
            onCreated?.(guest);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
