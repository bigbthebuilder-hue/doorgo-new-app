import {
  getPermissionAccess,
  type CurrentDoorGoAccess,
  type DoorGoAccessLevel,
} from '../auth/access';

export const PRODUCTION_SCHEDULE_PRESENTATION = {
  title: 'Production Schedule',
  statusLabel: 'Schedule view',
} as const;

export function getProductionScheduleAccess(
  access: CurrentDoorGoAccess,
): DoorGoAccessLevel {
  return getPermissionAccess(access, 'production');
}

export function canViewProductionSchedule(
  access: CurrentDoorGoAccess,
): boolean {
  return getProductionScheduleAccess(access) !== 'none';
}
