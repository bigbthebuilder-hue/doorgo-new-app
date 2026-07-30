import { resolveCurrentDoorGoAccess } from '@/lib/auth/access';
import type { WorkOrderPreflight } from '@/lib/jobs/work-order-preflight-contract';
import type { WorkOrderRecipient } from '@/lib/jobs/work-order-recipient-contract';

export const J3C_HARNESS_ONLY_MARKER = 'DOORGO_J3C_HARNESS_FIXTURE_7Q9';
export const recipientIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'] as const;
export const recipients: WorkOrderRecipient[] = [
  { userId: recipientIds[0], displayName: 'Fixture Alpha', email: 'alpha.fixture@example.invalid' },
  { userId: recipientIds[1], displayName: 'Fixture Zulu', email: 'zulu.fixture@example.invalid' },
];
export const excludedInactiveRecipient = { userId: '33333333-3333-4333-8333-333333333333', displayName: 'Fixture Inactive', email: 'inactive.fixture@example.invalid', active: false } as const;
export const accessFixture = (level: 'none' | 'view' | 'use', manager = false) => resolveCurrentDoorGoAccess({
  user: { id: '99999999-9999-4999-8999-999999999999' },
  profile: { user_id: '99999999-9999-4999-8999-999999999999', display_name: 'Fixture Requester', active: true, is_manager: manager, company_location: null, must_change_password: false },
  permissionRows: [{ permission_key: 'jobs', access_level: level }],
});
export const clearPreflight: WorkOrderPreflight = { issues: [], blocked: false, acknowledgementRequired: false };
export const warningPreflight: WorkOrderPreflight = { issues: [{ lineIndex: 1, status: 'Warning', message: 'Fixture warning requires review.' }], blocked: false, acknowledgementRequired: true };
export const blockedPreflight: WorkOrderPreflight = { issues: [{ lineIndex: 1, status: 'Blocked', message: 'Fixture line is blocked.' }], blocked: true, acknowledgementRequired: false };
