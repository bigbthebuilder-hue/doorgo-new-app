import 'server-only';
import { getCurrentDoorGoAccess } from '../auth/current-access';
import { createAuthenticatedSupabaseServerClient } from '../supabase/server';
import { createTrustedReadOnlySupabaseClient } from '../supabase/trusted-read-server';
import { UserAdminError } from './users-contract';
import { usersService, type UsersOperations } from './users-service';

export async function currentUsersService() {
  const access = await getCurrentDoorGoAccess();
  const client = await createAuthenticatedSupabaseServerClient();
  return usersService(access, (): UsersOperations => {
    // Approved bounded Auth administration extension. This client never authorizes callers.
    // The factory is invoked only after the service has checked session-derived access.
    const admin = createTrustedReadOnlySupabaseClient().auth.admin;
    return {
      async rpc(name, args) {
        const { data, error } = await client.rpc(name, args);
        if (error) throw new UserAdminError('User administration could not be saved or loaded. Check access and that the administration migration is applied.');
        return data;
      },
      async email(id) {
        const { data, error } = await admin.getUserById(id);
        if (error) throw new UserAdminError('Account email could not be loaded. Try again.');
        return data.user.email ?? null;
      },
      async createAuth(email, password) {
        const { data, error } = await admin.createUser({ email, password, email_confirm: true });
        if (error || !data.user) {
          if (error?.code === 'email_exists' || error?.code === 'user_already_exists') throw new UserAdminError('An account already uses this email. Select the existing account instead.');
          throw new UserAdminError('Auth account creation failed. Check the email and temporary password, then retry.');
        }
        return data.user.id;
      },
      async deleteCreatedAuth(id) {
        const { error } = await admin.deleteUser(id);
        if (error) throw new Error('Compensation failed');
      },
      async resetAuth(id, password) {
        const { error } = await admin.updateUserById(id, { password });
        if (error) throw new UserAdminError('Temporary password reset failed. No successful reset was confirmed.');
      },
      operationalError(code, id) { console.error('DoorGo user administration', { code, userId: id }); },
    };
  });
}
