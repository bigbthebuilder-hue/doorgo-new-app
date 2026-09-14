import type { CurrentDoorGoAccess, DoorGoPermissionMap } from '../auth/access';
import { assertUserAdmin, provisionInput, temporaryPassword, UserAdminError, validatePermissions, validateUserId, type AdminUser } from './users-contract';

export type UsersOperations = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  email: (userId: string) => Promise<string | null>;
  createAuth: (email: string, password: string) => Promise<string>;
  deleteCreatedAuth: (userId: string) => Promise<void>;
  resetAuth: (userId: string, password: string) => Promise<void>;
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
    async setActive(id: string, active: boolean): Promise<AdminUser> {
      assertUserAdmin(access, true);
      validateUserId(id);
      if (typeof active !== 'boolean') throw new UserAdminError('Invalid account status.');
      if (access.user?.id === id && !active) throw new UserAdminError('You cannot deactivate your own account.');
      return await operations().rpc('dg_admin_set_user_active', { p_user_id: id, p_active: active }) as AdminUser;
    },
    async requirePasswordChange(id: string): Promise<AdminUser> {
      assertUserAdmin(access, true);
      validateUserId(id);
      return await operations().rpc('dg_admin_require_password_change', { p_user_id: id }) as AdminUser;
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
    async resetPassword(id: string, form: FormData): Promise<AdminUser> {
      assertUserAdmin(access, true);
      validateUserId(id);
      const password = temporaryPassword(form);
      const ops = operations();
      await target(ops, id);
      await ops.resetAuth(id, password);
      try {
        return await ops.rpc('dg_admin_require_password_change', { p_user_id: id }) as AdminUser;
      } catch {
        ops.operationalError('user_password_requirement_failed', id);
        throw new UserAdminError('The password changed, but the password-change requirement could not be confirmed. Use Require Password Change before handing over the temporary password.');
      }
    },
  };
}
