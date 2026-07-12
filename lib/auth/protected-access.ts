import 'server-only';
import { redirect } from 'next/navigation';
import { getCurrentDoorGoAccess } from './current-access';
import {
  getProtectedAccessRedirect,
  type CurrentDoorGoAccess,
} from './access';

export async function requireDoorGoProtectedAccess(): Promise<CurrentDoorGoAccess> {
  const access = await getCurrentDoorGoAccess();
  const destination = getProtectedAccessRedirect(access);

  if (destination) {
    redirect(destination);
  }

  return access;
}
