'use client';

import { useState } from 'react';
import { useMutation } from 'urql';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DataTable,
  type Column,
} from '@repo/ui';
import { toast } from 'sonner';
import {
  AdminRevokeInvitationDocument,
  type AdminTenantInvitationsQuery,
} from '@/lib/graphql/generated/graphql';

export type Invitation = NonNullable<
  NonNullable<AdminTenantInvitationsQuery['tenantInvitations']>[number]
>;

export interface InvitationsTableProps {
  invitations: Invitation[];
  onChanged: () => void;
}

function formatDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export function InvitationsTable({
  invitations,
  onChanged,
}: InvitationsTableProps): React.JSX.Element {
  const [, revoke] = useMutation(AdminRevokeInvitationDocument);
  const [confirmRevoke, setConfirmRevoke] = useState<Invitation | null>(null);

  const onConfirm = async (): Promise<void> => {
    if (!confirmRevoke?.id) return;
    const id = confirmRevoke.id;
    const result = await revoke({ input: { invitationId: id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Invitation revoked');
    setConfirmRevoke(null);
    onChanged();
  };

  const columns: Column<Invitation>[] = [
    {
      key: 'email',
      header: 'Email',
      cell: (i) => i.email ?? '—',
    },
    {
      key: 'role',
      header: 'Role',
      cell: (i) => <span className="font-mono text-xs">{i.role ?? '—'}</span>,
    },
    {
      key: 'location',
      header: 'Location',
      cell: (i) =>
        i.location?.name ?? (
          <span className="text-muted-foreground">Tenant-wide</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Sent',
      cell: (i) => formatDate(i.createdAt),
    },
    {
      key: 'expiresAt',
      header: 'Expires',
      cell: (i) => formatDate(i.expiresAt),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-32 text-right',
      cell: (i) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmRevoke(i)}
        >
          Revoke
        </Button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={invitations}
        rowKey={(i) => i.id ?? ''}
        emptyTitle="No pending invitations"
        emptyDescription="Invite a teammate to see them here while they accept."
      />
      <Dialog
        open={confirmRevoke !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmRevoke(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke invitation?</DialogTitle>
            <DialogDescription>
              The invite link for {confirmRevoke?.email} will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevoke(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirm}>
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
