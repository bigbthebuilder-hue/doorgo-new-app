import { canUse, type CurrentDoorGoAccess } from '../auth/access';

/** Calendar operations never inherit permission from planning or administration. */
export function canMutateCalendar(access: CurrentDoorGoAccess): boolean {
  return canUse(access, 'calendar');
}
