'use client';

import { useState } from 'react';
import { useQuery } from 'urql';
import { Button } from '@repo/ui';
import {
  AdminTenantInvitationsDocument,
  AdminTenantLocationsDocument,
  AdminTenantMembersDocument,
} from '@/lib/graphql/generated/graphql';
import { InviteMemberDialog } from '@/components/admin/invite-member-dialog';
import { MembersTable, type Member } from '@/components/admin/members-table';
import { InvitationsTable, type Invitation } from '@/components/admin/invitations-table';
import { useViewerId } from '@/lib/use-viewer-id';

const PAGE_SIZE = 50;

export default function AdminMembersPage(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [{ data: membersData, fetching: membersFetching }, refetchMembers] = useQuery({
    query: AdminTenantMembersDocument,
    variables: { first: PAGE_SIZE },
  });
  const [{ data: invitationsData, fetching: invitationsFetching }, refetchInvitations] = useQuery({
    query: AdminTenantInvitationsDocument,
  });
  const [{ data: locationsData }] = useQuery({
    query: AdminTenantLocationsDocument,
  });
  const viewerId = useViewerId();

  const members: Member[] = (membersData?.tenantMembers?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is Member => n != null);
  const invitations: Invitation[] = (invitationsData?.tenantInvitations ?? []).filter(
    (i): i is Invitation => i != null,
  );
  const locations = (locationsData?.tenantLocations ?? [])
    .filter((l): l is { id: string; name: string } => Boolean(l?.id && l?.name))
    .map((l) => ({ id: l.id, name: l.name }));

  const refetchAll = (): void => {
    refetchMembers({ requestPolicy: 'network-only' });
    refetchInvitations({ requestPolicy: 'network-only' });
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Team members</h2>
            <p className="text-sm text-muted-foreground">Manage who has access to this tenant.</p>
          </div>
          <Button onClick={() => setOpen(true)}>Invite member</Button>
        </div>
        {membersFetching && members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading members…</p>
        ) : (
          <MembersTable members={members} currentUserId={viewerId} onChanged={refetchAll} />
        )}
      </section>
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Pending invitations</h2>
          <p className="text-sm text-muted-foreground">
            Invitations awaiting acceptance. Each link expires after 24 hours.
          </p>
        </div>
        {invitationsFetching && invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading invitations…</p>
        ) : (
          <InvitationsTable invitations={invitations} onChanged={refetchAll} />
        )}
      </section>
      <InviteMemberDialog
        locations={locations}
        open={open}
        onOpenChange={setOpen}
        onCreated={refetchAll}
      />
    </div>
  );
}
