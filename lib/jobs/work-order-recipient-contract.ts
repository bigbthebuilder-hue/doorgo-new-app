import { getPermissionAccess, type CurrentDoorGoAccess } from '../auth/access';
import { canReadJobs } from './job-intake-contract';

export type WorkOrderRecipient = {
  userId: string;
  displayName: string;
  email: string;
};

export type WorkOrderRecipientProfile = {
  userId: string;
  displayName: string;
  active: boolean;
};

export type WorkOrderAuthUser = {
  userId: string;
  email: string | null;
};

export async function loadPaginatedWorkOrderAuthUsers(
  loadPage: (page: number, perPage: number) => Promise<readonly WorkOrderAuthUser[]>,
  perPage = 1000,
): Promise<WorkOrderAuthUser[]> {
  const users: WorkOrderAuthUser[] = [];
  for (let page = 1; ; page += 1) {
    const pageUsers = await loadPage(page, perPage);
    users.push(...pageUsers);
    if (pageUsers.length < perPage) return users;
  }
}

export class WorkOrderRecipientFailure extends Error {
  constructor(public readonly code: 'permission_required' | 'invalid_selection' | 'recipient_unavailable' | 'directory_unavailable', message: string) {
    super(message);
    this.name = 'WorkOrderRecipientFailure';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function assertWorkOrderRecipientAccess(access: CurrentDoorGoAccess): void {
  if (!canReadJobs(getPermissionAccess(access, 'jobs'))) {
    throw new WorkOrderRecipientFailure('permission_required', 'Jobs access is required to send this work order.');
  }
}

export function buildActiveWorkOrderRecipientDirectory(
  profiles: readonly WorkOrderRecipientProfile[],
  authUsers: readonly WorkOrderAuthUser[],
): WorkOrderRecipient[] {
  const authById = new Map(authUsers.map((user) => [user.userId, user]));
  return profiles.flatMap((profile): WorkOrderRecipient[] => {
    const authUser = authById.get(profile.userId);
    const displayName = profile.displayName.trim();
    const email = authUser?.email?.trim() ?? '';
    if (!profile.active || !displayName || !EMAIL.test(email)) return [];
    return [{ userId: profile.userId, displayName, email }];
  }).sort((left, right) => left.displayName.localeCompare(right.displayName) || left.email.localeCompare(right.email));
}

export function resolveSelectedWorkOrderRecipients(
  selectedUserIds: readonly string[],
  directory: readonly WorkOrderRecipient[],
): WorkOrderRecipient[] {
  if (!selectedUserIds.length) {
    throw new WorkOrderRecipientFailure('invalid_selection', 'Select at least one recipient.');
  }
  const normalized = selectedUserIds.map((value) => typeof value === 'string' ? value.trim() : '');
  if (normalized.some((value) => !UUID.test(value)) || new Set(normalized).size !== normalized.length) {
    throw new WorkOrderRecipientFailure('invalid_selection', 'Select valid, non-duplicated DoorGo recipients.');
  }
  const byId = new Map(directory.map((recipient) => [recipient.userId, recipient]));
  const resolved = normalized.map((userId) => byId.get(userId));
  if (resolved.some((recipient) => !recipient)) {
    throw new WorkOrderRecipientFailure('recipient_unavailable', 'One or more recipients are no longer active DoorGo login users. Refresh and choose recipients again.');
  }
  return resolved as WorkOrderRecipient[];
}
