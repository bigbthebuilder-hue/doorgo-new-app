'use server';

import { revalidatePath } from 'next/cache';
import type { DoorGoPermissionMap } from '../auth/access';
import { UserAdminError, type AdminResult, type AdminUser } from './users-contract';
import { currentUsersService } from './users-server';

async function perform(operation: () => Promise<AdminUser>, message: string): Promise<AdminResult> {
  try {
    const user = await operation();
    revalidatePath('/manager');
    return { ok: true, message, user };
  } catch (error) {
    return { ok: false, message: error instanceof UserAdminError ? error.message : 'User administration is unavailable. Try again.' };
  }
}
export async function loadAdminUsers(): Promise<{ ok: true; users: AdminUser[] } | { ok: false; message: string }> {
  try { return { ok: true, users: await (await currentUsersService()).list() }; }
  catch (error) { return { ok: false, message: error instanceof UserAdminError ? error.message : 'Users could not be loaded. Check server configuration and the administration migration.' }; }
}
export async function createAdminUser(form: FormData, permissions: DoorGoPermissionMap) {
  return perform(async () => (await currentUsersService()).create(form, permissions), 'User created. Initial password change is required.');
}
export async function saveAdminPermissions(id: string, permissions: DoorGoPermissionMap) {
  return perform(async () => (await currentUsersService()).savePermissions(id, permissions), 'Module access saved.');
}
export async function setAdminUserActive(id: string, active: boolean) {
  return perform(async () => (await currentUsersService()).setActive(id, active), active ? 'User reactivated.' : 'User deactivated.');
}
export async function requireAdminPasswordChange(id: string) {
  return perform(async () => (await currentUsersService()).requirePasswordChange(id), 'Password change required.');
}
export async function resetAdminPassword(id: string, form: FormData) {
  return perform(async () => (await currentUsersService()).resetPassword(id, form), 'Temporary password reset. Password change is required.');
}
