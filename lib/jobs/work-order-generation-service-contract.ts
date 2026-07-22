import { getPermissionAccess, type CurrentDoorGoAccess } from '../auth/access';
import { canReadJobs, jobFailureMessage } from './job-intake-contract';
import { JobIntakeFailure, type JobIntakeRepository } from './job-intake-types';
import { generateWorkOrderDocument, type WorkOrderDocument, type WorkOrderGenerationInput } from './work-order-document-contract';

function accessFailure(access: CurrentDoorGoAccess): JobIntakeFailure {
  if (access.state === 'unauthenticated') return new JobIntakeFailure('authentication_required', jobFailureMessage('authentication_required'));
  if (access.state !== 'active') return new JobIntakeFailure('active_profile_required', jobFailureMessage('active_profile_required'));
  return new JobIntakeFailure('permission_required', jobFailureMessage('permission_required'));
}

export function assertSavedWorkOrderAccess(access: CurrentDoorGoAccess): void {
  if (!canReadJobs(getPermissionAccess(access, 'jobs'))) throw accessFailure(access);
}

export async function generateSavedWorkOrderWithAccess(
  access: CurrentDoorGoAccess,
  internalJobId: string,
  generation: WorkOrderGenerationInput,
  repository: Pick<JobIntakeRepository, 'findById'>,
): Promise<WorkOrderDocument> {
  assertSavedWorkOrderAccess(access);
  const aggregate = await repository.findById(internalJobId);
  if (!aggregate) throw new JobIntakeFailure('not_found', 'The requested saved job was not found.');
  return generateWorkOrderDocument(aggregate, generation);
}
