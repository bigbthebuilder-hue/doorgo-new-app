import assert from 'node:assert/strict';
import {
  canUse,
  getPermissionAccess,
  getProtectedAccessRedirect,
  hasAtLeastView,
  isManager,
  normalizeAccessLevel,
  resolveCurrentDoorGoAccess,
} from './access';

function run(): void {
  assert.equal(normalizeAccessLevel('none'), 'none');
  assert.equal(normalizeAccessLevel('view'), 'view');
  assert.equal(normalizeAccessLevel('use'), 'use');
  assert.equal(normalizeAccessLevel('admin'), 'none');
  assert.equal(normalizeAccessLevel(undefined), 'none');

  const unauthenticated = resolveCurrentDoorGoAccess({ user: null, profile: null });
  assert.equal(unauthenticated.state, 'unauthenticated');
  assert.equal(hasAtLeastView(unauthenticated, 'production'), false);

  const missingProfile = resolveCurrentDoorGoAccess({
    user: { id: 'user-1', email: 'office@example.com' },
    profile: null,
  });
  assert.equal(missingProfile.state, 'missing_profile');
  assert.equal(getPermissionAccess(missingProfile, 'production'), 'none');

  const inactive = resolveCurrentDoorGoAccess({
    user: { id: 'user-1' },
    profile: {
      user_id: 'user-1',
      display_name: 'Office User',
      active: false,
      is_manager: true,
      company_location: null,
      must_change_password: true,
    },
    permissionRows: [{ permission_key: 'production', access_level: 'use' }],
  });
  assert.equal(inactive.state, 'inactive_profile');
  assert.equal(canUse(inactive, 'production'), false);
  assert.equal(isManager(inactive), false);

  const active = resolveCurrentDoorGoAccess({
    user: { id: 'user-1' },
    profile: {
      user_id: 'user-1',
      display_name: 'Office User',
      active: true,
      is_manager: true,
      company_location: '  Main Shop  ',
      must_change_password: false,
    },
    permissionRows: [
      { permission_key: 'production', access_level: 'use' },
      { permission_key: 'reports', access_level: 'view' },
      { permission_key: 'settings', access_level: 'unexpected' },
    ],
  });
  assert.equal(active.state, 'active');
  assert.equal(active.profile.companyLocation, 'Main Shop');
  assert.equal(isManager(active), true);
  assert.equal(canUse(active, 'production'), true);
  assert.equal(hasAtLeastView(active, 'reports'), true);
  assert.equal(canUse(active, 'reports'), false);
  assert.equal(getPermissionAccess(active, 'settings'), 'none');
  assert.equal(getPermissionAccess(active, 'users'), 'none');

  const falseStringManager = resolveCurrentDoorGoAccess({
    user: { id: 'user-2' },
    profile: {
      user_id: 'user-2',
      display_name: 'Second User',
      active: true,
      is_manager: 'true',
      company_location: '',
      must_change_password: false,
    },
  });
  assert.equal(falseStringManager.state, 'active');
  assert.equal(isManager(falseStringManager), false);
  assert.equal(falseStringManager.profile.companyLocation, null);

  const managerMustChange = resolveCurrentDoorGoAccess({
    user: { id: 'manager' },
    profile: {
      user_id: 'manager',
      display_name: 'Manager',
      active: true,
      is_manager: true,
      company_location: null,
      must_change_password: true,
    },
    permissionRows: [{ permission_key: 'production', access_level: 'use' }],
  });
  assert.equal(getProtectedAccessRedirect(managerMustChange), '/account/change-password');
  assert.equal(canUse(managerMustChange, 'production'), true);
  assert.equal(getProtectedAccessRedirect(active), null);
  assert.equal(getProtectedAccessRedirect(unauthenticated), '/login');

  console.log('DoorGo access helper verification passed');
}

run();
