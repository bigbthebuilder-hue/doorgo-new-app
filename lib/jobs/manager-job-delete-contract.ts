import { canUse, type CurrentDoorGoAccess } from '../auth/access';
import { jobFailureMessage } from './job-intake-contract';
import { JobIntakeFailure } from './job-intake-types';

export function assertManagerDeleteAccess(access: CurrentDoorGoAccess): void {
  if (!canUse(access, 'administration')) {
    throw new JobIntakeFailure('manager_required', jobFailureMessage('manager_required'));
  }
}
