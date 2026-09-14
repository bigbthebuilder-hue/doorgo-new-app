import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOORGO_PERMISSION_KEYS, type CurrentDoorGoAccess, type DoorGoPermissionMap } from '../auth/access';
import { buildProtectedAppNavigation } from '../app-shell/navigation';
import { adminWorkspaceAccess, validatePermissions, type AdminUser } from './users-contract';
import { usersService, type UsersOperations } from './users-service';

const actor = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const permissions = (level: 'none' | 'view' | 'use' = 'none'): DoorGoPermissionMap => Object.fromEntries(DOORGO_PERMISSION_KEYS.map(key => [key, level]));
function access(users = 'use', settings = 'none'): CurrentDoorGoAccess {
  return { state: 'active', user: { id: actor, email: null }, profile: { userId: actor, displayName: 'Admin', active: true, isManager: false, companyLocation: null, mustChangePassword: false }, permissions: { users, settings } as DoorGoPermissionMap };
}
function form() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ displayName: 'Test User', email: 'test@example.invalid', companyLocation: 'Shop', active: 'true', newPassword: 'temporary-test-password', confirmPassword: 'temporary-test-password' })) form.set(key, value);
  return form;
}
function harness(options: { provisioningFails?: boolean; cleanupFails?: boolean; requirementFails?: boolean; authFails?: boolean } = {}) {
  const calls: string[] = [];
  let stored: AdminUser = { userId: targetId, email: null, displayName: 'Test', active: true, companyLocation: null, mustChangePassword: false, passwordChangedAt: null, permissions: permissions() };
  const ops: UsersOperations = {
    async rpc(name, args) {
      calls.push(name);
      assert.doesNotMatch(JSON.stringify(args ?? {}), /temporary-test-password|newPassword|confirmPassword/);
      if (name === 'dg_admin_list_users') return [structuredClone(stored)];
      if (name === 'dg_admin_provision_user') {
        if (options.provisioningFails) throw new Error('db failure');
        stored = { ...stored, displayName: String(args?.p_display_name), active: args?.p_active === true, permissions: args?.p_permissions as DoorGoPermissionMap, mustChangePassword: true };
      }
      if (name === 'dg_admin_update_permissions') stored = { ...stored, permissions: structuredClone(args?.p_permissions as DoorGoPermissionMap) };
      if (name === 'dg_admin_set_user_active') stored = { ...stored, active: args?.p_active === true };
      if (name === 'dg_admin_require_password_change') {
        if (options.requirementFails) throw new Error('db failure');
        stored = { ...stored, mustChangePassword: true };
      }
      return structuredClone(stored);
    },
    async email() { calls.push('email'); return 'test@example.invalid'; },
    async createAuth(email, password) { calls.push('createAuth'); assert.equal(email, 'test@example.invalid'); assert.equal(password, 'temporary-test-password'); if (options.authFails) throw new Error('duplicate'); return targetId; },
    async deleteCreatedAuth(id) { calls.push('deleteCreatedAuth'); assert.equal(id, targetId); if (options.cleanupFails) throw new Error('cleanup'); },
    async resetAuth(id, password) { calls.push('resetAuth'); assert.equal(id, targetId); assert.equal(password, 'temporary-test-password'); if (options.authFails) throw new Error('auth'); },
    operationalError(code, id) { calls.push(code); assert.equal(id, targetId); },
  };
  return { calls, service: (a = access()) => usersService(a, () => { calls.push('factory'); return ops; }) };
}

test('Admin navigation and tabs independently follow users/settings, never manager fallback', () => {
  for (const users of ['none', 'view', 'use']) for (const settings of ['none', 'view', 'use']) {
    const a = access(users, settings);
    assert.deepEqual(adminWorkspaceAccess(a), { users: users !== 'none', settings: settings !== 'none' });
    assert.equal(buildProtectedAppNavigation(a).some(item => item.href === '/manager' && item.label === 'Admin'), users !== 'none' || settings !== 'none');
  }
  const a = access('none'); a.profile!.isManager = true;
  assert.equal(buildProtectedAppNavigation(a).some(item => item.href === '/manager'), false);
});
test('denied/inactive/setup-required callers never reach privileged operations', async () => {
  const denied = [access('none'), access('view'), { ...access(), state: 'inactive_profile' } as CurrentDoorGoAccess, { ...access(), profile: { ...access().profile!, mustChangePassword: true } } as CurrentDoorGoAccess];
  for (const a of denied) {
    const h = harness(); const svc = h.service(a);
    await assert.rejects(svc.create(form(), permissions('use')));
    await assert.rejects(svc.savePermissions(targetId, permissions()));
    await assert.rejects(svc.setActive(targetId, false));
    await assert.rejects(svc.resetPassword(targetId, form()));
    await assert.rejects(svc.requirePasswordChange(targetId));
    assert.equal(h.calls.length, 0);
    if (a.permissions.users !== 'view') { await assert.rejects(svc.list()); assert.equal(h.calls.length, 0); }
  }
});
test('view can read cross-user directory and safe email identity', async () => {
  const h = harness(); const users = await h.service(access('view')).list();
  assert.equal(users[0].userId, targetId); assert.equal(users[0].email, 'test@example.invalid');
  assert.deepEqual(h.calls, ['factory', 'dg_admin_list_users', 'email']);
});
test('permission map strict validation rejects unknown, missing and invalid values', async () => {
  for (const invalid of [null, [], {}, { ...permissions(), unknown: 'use' }, { ...permissions(), users: 'admin' }, { ...permissions(), users: null }, { ...permissions(), users: 1 }]) assert.throws(() => validatePermissions(invalid));
  const h = harness(); await assert.rejects(h.service().savePermissions(targetId, { ...permissions(), users: 'invalid' } as unknown as DoorGoPermissionMap)); assert.equal(h.calls.length, 0);
});
test('persisted permission round trip supports full pilot and Calendar-only rollout', async () => {
  const h = harness(); const svc = h.service();
  assert.deepEqual((await svc.savePermissions(targetId, permissions('use'))).permissions, permissions('use'));
  const staff = { ...permissions(), calendar: 'use' } as DoorGoPermissionMap;
  await svc.savePermissions(targetId, staff);
  assert.deepEqual((await svc.list())[0].permissions, staff);
});
test('successful creation provisions initial setup without password in database payload', async () => {
  const h = harness(); const result = await h.service().create(form(), permissions());
  assert.equal(result.mustChangePassword, true); assert.equal(result.email, 'test@example.invalid');
  assert.deepEqual(h.calls, ['factory', 'createAuth', 'dg_admin_provision_user']);
  assert.doesNotMatch(JSON.stringify(result), /temporary-test-password/);
});
test('provisioning failure compensates only newly created Auth identity', async () => {
  const h = harness({ provisioningFails: true });
  await assert.rejects(h.service().create(form(), permissions()), /newly created Auth account was removed/);
  assert.deepEqual(h.calls, ['factory', 'createAuth', 'dg_admin_provision_user', 'deleteCreatedAuth']);
  const duplicate = harness({ authFails: true }); await assert.rejects(duplicate.service().create(form(), permissions()));
  assert.deepEqual(duplicate.calls, ['factory', 'createAuth']);
});
test('compensation failure reports administrator attention and only safe operational code', async () => {
  const h = harness({ provisioningFails: true, cleanupFails: true });
  await assert.rejects(h.service().create(form(), permissions()), /Administrator attention/);
  assert.equal(h.calls.at(-1), 'user_provision_compensation_failed');
});
test('reset validates target, mutates Auth, then marks existing password requirement', async () => {
  const h = harness(); assert.equal((await h.service().resetPassword(targetId, form())).mustChangePassword, true);
  assert.deepEqual(h.calls, ['factory', 'dg_admin_list_users', 'resetAuth', 'dg_admin_require_password_change']);
  const missing = harness(); await assert.rejects(missing.service().resetPassword(actor, form()), /not found/); assert.equal(missing.calls.includes('resetAuth'), false);
});
test('reset partial failure is explicit; Auth failure does not claim profile completion', async () => {
  const h = harness({ requirementFails: true }); await assert.rejects(h.service().resetPassword(targetId, form()), /password changed.*Require Password Change/);
  assert.equal(h.calls.at(-1), 'user_password_requirement_failed');
  const auth = harness({ authFails: true }); await assert.rejects(auth.service().resetPassword(targetId, form())); assert.equal(auth.calls.includes('dg_admin_require_password_change'), false);
});
test('password confirmation and existing validation run before Auth operations', async () => {
  for (const password of ['short', 'a'.repeat(257)]) {
    const h = harness(); const f = form(); f.set('newPassword', password); f.set('confirmPassword', password);
    await assert.rejects(h.service().resetPassword(targetId, f)); assert.equal(h.calls.length, 0);
  }
  const h = harness(); const f = form(); f.set('confirmPassword', 'different');
  await assert.rejects(h.service().create(f, permissions()), /do not match/); assert.equal(h.calls.length, 0);
});
test('activation persists; self-deactivation rejected before operations', async () => {
  const h = harness(); const svc = h.service(); await assert.rejects(svc.setActive(actor, false), /own account/); assert.equal(h.calls.length, 0);
  assert.equal((await svc.setActive(targetId, false)).active, false); assert.equal((await svc.list())[0].active, false);
  assert.equal((await svc.setActive(targetId, true)).active, true);
  assert.equal((await svc.requirePasswordChange(targetId)).mustChangePassword, true);
  assert.equal(h.calls.includes('resetAuth'), false);
});
