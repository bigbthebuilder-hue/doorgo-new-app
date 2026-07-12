export const DOORGO_PERMISSION_KEYS = [
  'production',
  'calendar',
  'jobs',
  'documents',
  'tools',
  'reports',
  'settings',
  'users',
] as const;

export type DoorGoPermissionKey = (typeof DOORGO_PERMISSION_KEYS)[number];
export type DoorGoAccessLevel = 'none' | 'view' | 'use';
export type DoorGoPermissionMap = Record<string, DoorGoAccessLevel>;
type EmptyPermissionMap = Record<string, never>;

export type DoorGoProfile = {
  userId: string;
  displayName: string;
  active: boolean;
  isManager: boolean;
  companyLocation: string | null;
  mustChangePassword: boolean;
};

export type CurrentDoorGoAccess =
  | {
      state: 'unauthenticated';
      user: null;
      profile: null;
      permissions: EmptyPermissionMap;
    }
  | {
      state: 'missing_profile';
      user: { id: string; email: string | null };
      profile: null;
      permissions: EmptyPermissionMap;
    }
  | {
      state: 'inactive_profile' | 'active';
      user: { id: string; email: string | null };
      profile: DoorGoProfile;
      permissions: DoorGoPermissionMap;
    };

export function normalizeAccessLevel(value: unknown): DoorGoAccessLevel {
  return value === 'view' || value === 'use' ? value : 'none';
}

export function buildPermissionMap(
  rows: Array<{ permission_key: unknown; access_level: unknown }>,
): DoorGoPermissionMap {
  const permissions: DoorGoPermissionMap = {};

  for (const row of rows) {
    if (typeof row.permission_key !== 'string' || !row.permission_key.trim()) {
      continue;
    }

    permissions[row.permission_key] = normalizeAccessLevel(row.access_level);
  }

  return permissions;
}

export function resolveCurrentDoorGoAccess(input: {
  user: { id: string; email?: string | null } | null;
  profile: {
    user_id: unknown;
    display_name: unknown;
    active: unknown;
    is_manager: unknown;
    company_location: unknown;
    must_change_password: unknown;
  } | null;
  permissionRows?: Array<{ permission_key: unknown; access_level: unknown }>;
}): CurrentDoorGoAccess {
  if (!input.user) {
    return { state: 'unauthenticated', user: null, profile: null, permissions: {} };
  }

  const user = { id: input.user.id, email: input.user.email ?? null };

  if (!input.profile) {
    return { state: 'missing_profile', user, profile: null, permissions: {} };
  }

  const profile: DoorGoProfile = {
    userId:
      typeof input.profile.user_id === 'string'
        ? input.profile.user_id
        : input.user.id,
    displayName:
      typeof input.profile.display_name === 'string'
        ? input.profile.display_name
        : '',
    active: input.profile.active === true,
    isManager: input.profile.is_manager === true,
    companyLocation:
      typeof input.profile.company_location === 'string' &&
      input.profile.company_location.trim()
        ? input.profile.company_location.trim()
        : null,
    mustChangePassword: input.profile.must_change_password !== false,
  };
  const permissions = buildPermissionMap(input.permissionRows ?? []);

  return {
    state: profile.active ? 'active' : 'inactive_profile',
    user,
    profile,
    permissions,
  };
}

export function getPermissionAccess(
  access: CurrentDoorGoAccess,
  permissionKey: string,
): DoorGoAccessLevel {
  if (access.state !== 'active') {
    return 'none';
  }

  return access.permissions[permissionKey] ?? 'none';
}

export function hasAtLeastView(
  access: CurrentDoorGoAccess,
  permissionKey: string,
): boolean {
  return getPermissionAccess(access, permissionKey) !== 'none';
}

export function canUse(
  access: CurrentDoorGoAccess,
  permissionKey: string,
): boolean {
  return getPermissionAccess(access, permissionKey) === 'use';
}

export function isManager(access: CurrentDoorGoAccess): boolean {
  return access.state === 'active' && access.profile.isManager;
}

export function getProtectedAccessRedirect(
  access: CurrentDoorGoAccess,
): '/login' | '/account/change-password' | null {
  if (access.state === 'unauthenticated') {
    return '/login';
  }

  if (access.state === 'active' && access.profile.mustChangePassword) {
    return '/account/change-password';
  }

  return null;
}
