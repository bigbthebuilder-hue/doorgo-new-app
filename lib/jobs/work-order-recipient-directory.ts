import 'server-only';

import type { CurrentDoorGoAccess } from '../auth/access';
import { createTrustedReadOnlySupabaseClient } from '../supabase/trusted-read-server';
import {
  assertWorkOrderRecipientAccess,
  buildActiveWorkOrderRecipientDirectory,
  loadPaginatedWorkOrderAuthUsers,
  resolveSelectedWorkOrderRecipients,
  WorkOrderRecipientFailure,
  type WorkOrderAuthUser,
  type WorkOrderRecipient,
  type WorkOrderRecipientProfile,
} from './work-order-recipient-contract';

export type WorkOrderRecipientDirectorySource = {
  loadProfiles: () => Promise<WorkOrderRecipientProfile[]>;
  loadAuthUsers: () => Promise<WorkOrderAuthUser[]>;
};

export function createSupabaseWorkOrderRecipientDirectorySource(): WorkOrderRecipientDirectorySource {
  const supabase = createTrustedReadOnlySupabaseClient();
  return {
    async loadProfiles() {
      const { data, error } = await supabase.from('dg_user_profiles').select('user_id, display_name, active');
      if (error) throw new WorkOrderRecipientFailure('directory_unavailable', 'DoorGo recipients are temporarily unavailable.');
      return (data ?? []).map((profile) => ({
        userId: String(profile.user_id),
        displayName: String(profile.display_name ?? ''),
        active: profile.active === true,
      }));
    },
    async loadAuthUsers() {
      return loadPaginatedWorkOrderAuthUsers(async (page, perPage) => {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
        if (error) throw new WorkOrderRecipientFailure('directory_unavailable', 'DoorGo recipients are temporarily unavailable.');
        return data.users.map((user) => ({ userId: user.id, email: user.email ?? null }));
      });
    },
  };
}

export async function listWorkOrderRecipientsWithAccess(
  access: CurrentDoorGoAccess,
  source: WorkOrderRecipientDirectorySource,
): Promise<WorkOrderRecipient[]> {
  assertWorkOrderRecipientAccess(access);
  const [profiles, authUsers] = await Promise.all([source.loadProfiles(), source.loadAuthUsers()]);
  return buildActiveWorkOrderRecipientDirectory(profiles, authUsers);
}

export async function resolveWorkOrderRecipientsWithAccess(
  access: CurrentDoorGoAccess,
  selectedUserIds: readonly string[],
  source: WorkOrderRecipientDirectorySource,
): Promise<WorkOrderRecipient[]> {
  return resolveSelectedWorkOrderRecipients(selectedUserIds, await listWorkOrderRecipientsWithAccess(access, source));
}
