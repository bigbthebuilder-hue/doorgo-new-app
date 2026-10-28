import type { CurrentDoorGoAccess, DoorGoPermissionMap } from '../auth/access';
import { assertUserAdmin, provisionInput, temporaryPassword, UserAdminError, validatePermissions, validateUserId, type AdminUser } from './users-contract';
import type { ResetResult } from './password-reset-operation';

export type UsersOperations = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  email: (userId: string) => Promise<string | null>;
  createAuth: (email: string, password: string) => Promise<string>;
  deleteCreatedAuth: (userId: string) => Promise<void>;
  resetPassword: (userId: string, form: FormData) => Promise<ResetResult>;
  reactivate: (userId: string, form: FormData) => Promise<ResetResult>;
  requirePasswordChange: (userId: string) => Promise<{ ok: boolean }>;
  deactivate: (userId: string) => Promise<{ ok: boolean }>;
  operationalError: (code: string, userId: string) => void;
};

// Authorization and validation precede the lazy privileged-operation factory.
export function usersService(access: CurrentDoorGoAccess, operations: () => UsersOperations) {
  async function target(ops: UsersOperations, id: string) {
    const users = await ops.rpc('dg_admin_list_users') as AdminUser[];
    const user = users.find(user => user.userId === id);
    if (!user) throw new UserAdminError('DoorGo user not found.');
    return user;
  }
  async function refreshed(ops: UsersOperations, id: string): Promise<AdminUser | undefined> {
    // The mutation is already confirmed. A failed directory refresh (including a
    // self-reset losing business access) must not invite another password write.
    try { return await target(ops, id); } catch { return undefined; }
  }
  function requireSuccess(result: ResetResult) {
    if (result.status === 'operation_complete') return;
    if (result.status === 'auth_rejected') throw new UserAdminError('The temporary password was rejected. Choose a different password.');
    if (result.status === 'not_allowed') throw new UserAdminError('This password operation is not allowed for the selected account. Refresh users.');
    throw new UserAdminError('The password operation could not be confirmed. Refresh users and obtain administrator recovery before retrying; do not hand over the temporary password.');
  }
  return {
    async list(): Promise<AdminUser[]> {
      assertUserAdmin(access, false);
      const ops = operations();
      const users = await ops.rpc('dg_admin_list_users') as AdminUser[];
      return Promise.all(users.map(async user => ({ ...user, email: await ops.email(user.userId) })));
    },
    async savePermissions(id: string, permissions: DoorGoPermissionMap): Promise<AdminUser> {
      assertUserAdmin(access, true);
      validateUserId(id);
      const validated = validatePermissions(permissions);
      return await operations().rpc('dg_admin_update_permissions', { p_user_id: id, p_permissions: validated }) as AdminUser;
    },
    async setActive(id: string, active: boolean): Promise<AdminUser | undefined> {
      assertUserAdmin(access, true);
      validateUserId(id);
      if (typeof active !== 'boolean') throw new UserAdminError('Invalid account status.');
      if (access.user?.id === id && !active) throw new UserAdminError('You cannot deactivate your own account.');
      if (active) throw new UserAdminError('Reactivation requires a new temporary password.');
      const ops = operations();
      if (!(await ops.deactivate(id)).ok) throw new UserAdminError('Deactivation could not be confirmed. Refresh users before retrying.');
      return refreshed(ops, id);
    },
    async requirePasswordChange(id: string): Promise<AdminUser | undefined> {
      assertUserAdmin(access, true);
      validateUserId(id);
      const ops = operations();
      if (!(await ops.requirePasswordChange(id)).ok) throw new UserAdminError('The password-change requirement could not be confirmed. Refresh users before retrying.');
      return refreshed(ops, id);
    },
    async create(form: FormData, permissions: DoorGoPermissionMap): Promise<AdminUser> {
      assertUserAdmin(access, true);
      const input = provisionInput(form);
      const validated = validatePermissions(permissions);
      const password = temporaryPassword(form);
      const ops = operations();
      const id = await ops.createAuth(input.email, password);
      try {
        const user = await ops.rpc('dg_admin_provision_user', {
          p_user_id: id, p_display_name: input.displayName, p_company_location: input.companyLocation,
          p_active: input.active, p_permissions: validated,
        }) as AdminUser;
        return { ...user, email: input.email };
      } catch {
        try { await ops.deleteCreatedAuth(id); }
        catch {
          ops.operationalError('user_provision_compensation_failed', id);
          throw new UserAdminError('Provisioning failed and account cleanup could not be confirmed. Administrator attention is required before retrying.');
        }
        throw new UserAdminError('DoorGo provisioning failed. The newly created Auth account was removed.');
      }
    },
    async resetPassword(id: string, form: FormData): Promise<AdminUser | undefined> {
      assertUserAdmin(access, true);
      validateUserId(id);
      temporaryPassword(form);
      const ops = operations();
      requireSuccess(await ops.resetPassword(id, form));
      return refreshed(ops, id);
    },
    async reactivate(id: string, form: FormData): Promise<AdminUser | undefined> {
      assertUserAdmin(access, true);
      validateUserId(id);
      temporaryPassword(form);
      const ops = operations();
      requireSuccess(await ops.reactivate(id, form));
      return refreshed(ops, id);
    },
  };
}
