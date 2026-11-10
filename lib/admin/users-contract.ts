import { canUse, DOORGO_PERMISSION_KEYS, hasAtLeastView, type CurrentDoorGoAccess, type DoorGoPermissionMap } from '../auth/access';
import { validateNewPasswordForm } from '../auth/password-setup';

export const MODULE_LABELS: Record<string, string> = {
  production: 'Production Board', production_checkpoints: 'Production Checkpoints', calendar: 'Calendar',
  jobs: 'Jobs', documents: 'Documents', administration: 'Administration',
};
export type AdminUser = {
  userId: string; displayName: string; email: string | null; active: boolean;
  companyLocation: string | null; mustChangePassword: boolean; passwordChangedAt: string | null;
  permissions: DoorGoPermissionMap;
};
export type AdminResult = { ok: boolean; message: string; user?: AdminUser };
export class UserAdminError extends Error {}
export function adminWorkspaceAccess(access: CurrentDoorGoAccess) {
  return { users: hasAtLeastView(access, 'users'), settings: hasAtLeastView(access, 'settings') };
}
export function assertUserAdmin(access: CurrentDoorGoAccess, write: boolean): void {
  if (access.state !== 'active' || access.profile.mustChangePassword ||
      !(write ? canUse(access, 'users') : hasAtLeastView(access, 'users'))) {
    throw new UserAdminError('User administration permission is required.');
  }
}
export function permissionIssues(grants: DoorGoPermissionMap): string[] {
  const issues: string[] = [];
  if (grants.jobs === 'use' && grants.calendar !== 'use') issues.push('Jobs Use requires Calendar Use.');
  if (grants.jobs === 'view' && (!grants.calendar || grants.calendar === 'none')) issues.push('Jobs View requires Calendar View or Use.');
  if (grants.production !== grants.production_checkpoints ||
      grants.production === 'view' || grants.production_checkpoints === 'view') {
    issues.push('Production Board and Production Checkpoints must both be None or both be Use.');
  }
  if (grants.production === 'use' && (grants.jobs !== 'use' || grants.calendar !== 'use')) {
    issues.push('Production Use requires Jobs Use and Calendar Use.');
  }
  if (grants.administration === 'view') issues.push('Administration must be None or Use.');
  return issues;
}

export function changeModulePermission(grants: DoorGoPermissionMap, key: string, level: DoorGoPermissionMap[string]): DoorGoPermissionMap {
  const next = { ...grants, [key]: level };
  if (key === 'production' || key === 'production_checkpoints') {
    next.production = next.production_checkpoints = level;
    if (level === 'use') next.jobs = next.calendar = 'use';
  }
  if (key === 'jobs' && level === 'use') next.calendar = 'use';
  if (key === 'jobs' && level === 'view' && next.calendar === 'none') next.calendar = 'view';
  return next;
}

export function validatePermissions(value: unknown): DoorGoPermissionMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UserAdminError('Invalid module access.');
  const entries = Object.entries(value);
  if (entries.length !== DOORGO_PERMISSION_KEYS.length || entries.some(([key, level]) =>
    !(DOORGO_PERMISSION_KEYS as readonly string[]).includes(key) || !['none', 'view', 'use'].includes(String(level)) || typeof level !== 'string')) {
    throw new UserAdminError('Choose None, View or Use for every module.');
  }
  const grants = Object.fromEntries(entries) as DoorGoPermissionMap;
  const issues = permissionIssues(grants);
  if (issues.length) throw new UserAdminError(issues.join(' '));
  return grants;
}
export function validateUserId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new UserAdminError('Invalid user.');
  return value;
}
export function temporaryPassword(form: FormData): string {
  const result = validateNewPasswordForm(form);
  if (!result.valid) throw new UserAdminError(result.message);
  return result.password;
}
export function provisionInput(form: FormData) {
  const displayName = String(form.get('displayName') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const companyLocation = String(form.get('companyLocation') ?? '').trim();
  if (!displayName || displayName.length > 200 || companyLocation.length > 200 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserAdminError('Enter a valid name, email and company/location (up to 200 characters).');
  return { displayName, email, companyLocation: companyLocation || null, active: form.get('active') === 'true' };
}
