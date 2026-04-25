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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  type Column,
} from '@repo/ui';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import {
  AdminRevokeMembershipDocument,
  AdminUpdateMembershipRoleDocument,
  Role,
  type AdminTenantMembersQuery,
} from '@/lib/graphql/generated/graphql';

type MembershipNode = NonNullable<
  NonNullable<NonNullable<AdminTenantMembersQuery['tenantMembers']>['edges']>[number]
>['node'];

export type Member = NonNullable<MembershipNode>;

export interface MembersTableProps {
  members: Member[];
  currentUserId: string | null;
  onChanged: () => void;
}

const ROLE_OPTIONS: Role[] = [Role.Owner, Role.Admin, Role.Manager, Role.Staff, Role.Viewer];

function formatDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export function MembersTable({
  members,
  currentUserId,
  onChanged,
}: MembersTableProps): React.JSX.Element {
  const [, revoke] = useMutation(AdminRevokeMembershipDocument);
  const [, updateRole] = useMutation(AdminUpdateMembershipRoleDocument);
  const [confirmRevoke, setConfirmRevoke] = useState<Member | null>(null);
  const [editRole, setEditRole] = useState<Member | null>(null);

  const columns: Column<Member>[] = [
    {
      key: 'user',
      header: 'Member',
      cell: (m) => (
        <div className="flex flex-col">
          <span className="font-medium">{m.user?.name ?? m.user?.email ?? '—'}</span>
          {m.user?.name ? (
            <span className="text-xs text-muted-foreground">{m.user.email}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (m) => <span className="font-mono text-xs">{m.role ?? '—'}</span>,
    },
    {
      key: 'location',
      header: 'Location',
      cell: (m) => m.location?.name ?? <span className="text-muted-foreground">Tenant-wide</span>,
    },
    {
      key: 'createdAt',
      header: 'Joined',
      cell: (m) => formatDate(m.createdAt),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      cell: (m) => {
        const isSelf = currentUserId !== null && m.user?.id === currentUserId;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Member actions" disabled={isSelf}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditRole(m)}>Change role</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmRevoke(m)}>
                Remove from team
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const onConfirmRevoke = async (): Promise<void> => {
    if (!confirmRevoke?.id) return;
    const id = confirmRevoke.id;
    const result = await revoke({ input: { membershipId: id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Member removed');
    setConfirmRevoke(null);
    onChanged();
  };

  const onSubmitRoleChange = async (newRole: Role): Promise<void> => {
    if (!editRole?.id) return;
    const id = editRole.id;
    const result = await updateRole({
      input: { membershipId: id, role: newRole },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Role updated');
    setEditRole(null);
    onChanged();
  };

  return (
    <>
      <DataTable
        columns={columns}
        rows={members}
        rowKey={(m) => m.id ?? ''}
        emptyTitle="No members yet"
        emptyDescription="Invite your team to get started."
      />
      <Dialog
        open={confirmRevoke !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmRevoke(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove team member?</DialogTitle>
            <DialogDescription>
              This revokes their membership immediately. They will lose access the next time their
              session checks scope.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRevoke(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onConfirmRevoke}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={editRole !== null}
        onOpenChange={(o) => {
          if (!o) setEditRole(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change member role</DialogTitle>
            <DialogDescription>
              Pick the new role for {editRole?.user?.email ?? 'this member'}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {ROLE_OPTIONS.map((r) => (
              <Button
                key={r}
                variant={editRole?.role === r ? 'default' : 'outline'}
                className="justify-start font-mono"
                onClick={() => onSubmitRoleChange(r)}
              >
                {r}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRole(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
