import { strict as assert } from 'node:assert';
import {
  getProtectedAccessRedirect,
  resolveCurrentDoorGoAccess,
} from '../auth/access';
import {
  canViewProductionSchedule,
  getProductionScheduleAccess,
  PRODUCTION_SCHEDULE_PRESENTATION,
} from './view-access';

const activeAccess = ({
  production,
  isManager = false,
  extraPermissions = [],
}: {
  production?: 'none' | 'view' | 'use';
  isManager?: boolean;
  extraPermissions?: Array<{ permission_key: string; access_level: 'view' | 'use' }>;
}) =>
  resolveCurrentDoorGoAccess({
    user: { id: '00000000-0000-4000-8000-000000000001' },
    profile: {
      user_id: '00000000-0000-4000-8000-000000000001',
      display_name: 'Schedule tester',
      active: true,
      is_manager: isManager,
      company_location: null,
      must_change_password: false,
    },
    permissionRows: [
      ...(production
        ? [{ permission_key: 'production', access_level: production }]
        : []),
      ...extraPermissions,
    ],
  });

assert.deepEqual(PRODUCTION_SCHEDULE_PRESENTATION, {
  title: 'Production Schedule',
  statusLabel: 'Schedule view',
});

const unauthenticated = resolveCurrentDoorGoAccess({ user: null, profile: null });
assert.equal(getProtectedAccessRedirect(unauthenticated), '/login');
assert.equal(canViewProductionSchedule(unauthenticated), false);

const missingProfile = resolveCurrentDoorGoAccess({
  user: { id: '00000000-0000-4000-8000-000000000001' },
  profile: null,
});
assert.equal(canViewProductionSchedule(missingProfile), false);

const inactiveProfile = resolveCurrentDoorGoAccess({
  user: { id: '00000000-0000-4000-8000-000000000001' },
  profile: {
    user_id: '00000000-0000-4000-8000-000000000001',
    display_name: 'Inactive tester',
    active: false,
    is_manager: true,
    company_location: null,
    must_change_password: false,
  },
  permissionRows: [{ permission_key: 'production', access_level: 'use' }],
});
assert.equal(canViewProductionSchedule(inactiveProfile), false);

assert.equal(canViewProductionSchedule(activeAccess({})), false);
assert.equal(canViewProductionSchedule(activeAccess({ production: 'none' })), false);
assert.equal(getProductionScheduleAccess(activeAccess({ production: 'view' })), 'view');
assert.equal(canViewProductionSchedule(activeAccess({ production: 'view' })), true);
assert.equal(getProductionScheduleAccess(activeAccess({ production: 'use' })), 'use');
assert.equal(canViewProductionSchedule(activeAccess({ production: 'use' })), true);
assert.equal(canViewProductionSchedule(activeAccess({ isManager: true })), false);
assert.equal(
  canViewProductionSchedule(
    activeAccess({
      extraPermissions: [
        { permission_key: 'calendar', access_level: 'use' },
        { permission_key: 'production_checkpoints', access_level: 'use' },
      ],
    }),
  ),
  false,
);

console.log('Phase 2F-E2A Production Schedule access tests passed');
