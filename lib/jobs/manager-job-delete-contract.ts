import { isManager, type CurrentDoorGoAccess } from '../auth/access';
import { jobFailureMessage } from './job-intake-contract';
import { JobIntakeFailure } from './job-intake-types';

export function assertManagerDeleteAccess(access: CurrentDoorGoAccess): void {
  if (!isManager(access)) {
    throw new JobIntakeFailure('manager_required', jobFailureMessage('manager_required'));
  }
}
