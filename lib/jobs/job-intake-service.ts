import 'server-only';

import {
  getPermissionAccess,
  type CurrentDoorGoAccess,
} from '@/lib/auth/access';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { canReadJobs, canWriteJobs, jobFailureMessage } from './job-intake-contract';
import { createJobIntakeRepository } from './job-intake-repository';
import {
  JobIntakeFailure,
  type CreateJobHeaderCommand,
  type JobHeaderInput,
  type JobIntakeRepository,
  type NativeJobHeader,
  type UpdateJobHeaderCommand,
} from './job-intake-types';

function accessFailure(access: CurrentDoorGoAccess): JobIntakeFailure {
  if (access.state === 'unauthenticated') {
    return new JobIntakeFailure('authentication_required', jobFailureMessage('authentication_required'));
  }
  if (access.state !== 'active') {
    return new JobIntakeFailure('active_profile_required', jobFailureMessage('active_profile_required'));
  }
  return new JobIntakeFailure('permission_required', jobFailureMessage('permission_required'));
}

export function assertJobsReadAccess(access: CurrentDoorGoAccess): void {
  if (!canReadJobs(getPermissionAccess(access, 'jobs'))) throw accessFailure(access);
}

export function assertJobsWriteAccess(access: CurrentDoorGoAccess): void {
  if (!canWriteJobs(getPermissionAccess(access, 'jobs'))) throw accessFailure(access);
}

export async function listJobsWithAccess(
  access: CurrentDoorGoAccess,
  repository: JobIntakeRepository = createJobIntakeRepository(),
): Promise<NativeJobHeader[]> {
  assertJobsReadAccess(access);
  return repository.list();
}

export async function findJobWithAccess(
  access: CurrentDoorGoAccess,
  internalJobId: string,
  repository: JobIntakeRepository = createJobIntakeRepository(),
): Promise<NativeJobHeader | null> {
  assertJobsReadAccess(access);
  return repository.findById(internalJobId);
}

export async function createJobWithAccess(
  access: CurrentDoorGoAccess,
  request: { commandId: string; input: JobHeaderInput },
  repository: JobIntakeRepository = createJobIntakeRepository(),
): Promise<NativeJobHeader> {
  assertJobsWriteAccess(access);
  if (access.state !== 'active') throw accessFailure(access);
  const command: CreateJobHeaderCommand = {
    commandId: request.commandId,
    actorUserId: access.user.id,
    defaultSalesperson: access.profile.displayName.trim() || null,
    input: request.input,
  };
  return repository.create(command);
}

export async function updateJobWithAccess(
  access: CurrentDoorGoAccess,
  request: Omit<UpdateJobHeaderCommand, 'actorUserId'>,
  repository: JobIntakeRepository = createJobIntakeRepository(),
): Promise<NativeJobHeader> {
  assertJobsWriteAccess(access);
  if (access.state !== 'active') throw accessFailure(access);
  return repository.update({ ...request, actorUserId: access.user.id });
}

export async function loadCurrentJobs(): Promise<NativeJobHeader[]> {
  return listJobsWithAccess(await getCurrentDoorGoAccess());
}

export async function loadCurrentJob(internalJobId: string): Promise<NativeJobHeader | null> {
  return findJobWithAccess(await getCurrentDoorGoAccess(), internalJobId);
}
