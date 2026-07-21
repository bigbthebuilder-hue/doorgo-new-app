import 'server-only';

import {
  getPermissionAccess,
  type CurrentDoorGoAccess,
} from '@/lib/auth/access';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { canReadJobs, canWriteJobs, jobFailureMessage } from './job-intake-contract';
import { assertConfirmedJobActiveLineInvariant } from './door-line-contract';
import { applyManualGeometryOverride, removeManualGeometryOverride } from './glass-geometry-contract';
import { createJobIntakeRepository } from './job-intake-repository';
import {
  JobIntakeFailure,
  type CreateJobHeaderCommand,
  type DoorLineInput,
  type GlassGeometryValues,
  type GlassOverrideApproval,
  type JobHeaderInput,
  type JobIntakeRepository,
  type NativeJobAggregate,
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
): Promise<NativeJobAggregate[]> {
  assertJobsReadAccess(access);
  return repository.list();
}

export async function findJobWithAccess(
  access: CurrentDoorGoAccess,
  internalJobId: string,
  repository: JobIntakeRepository = createJobIntakeRepository(),
): Promise<NativeJobAggregate | null> {
  assertJobsReadAccess(access);
  return repository.findById(internalJobId);
}

export async function createJobWithAccess(
  access: CurrentDoorGoAccess,
  request: { commandId: string; input: JobHeaderInput; lines?: DoorLineInput[] },
  repository: JobIntakeRepository = createJobIntakeRepository(),
): Promise<NativeJobAggregate> {
  assertJobsWriteAccess(access);
  if (access.state !== 'active') throw accessFailure(access);
  assertConfirmedJobActiveLineInvariant(request.input.lifecycleStage, request.lines ?? []);
  const command: CreateJobHeaderCommand = {
    commandId: request.commandId,
    actorUserId: access.user.id,
    defaultSalesperson: access.profile.displayName.trim() || null,
    input: request.input,
    lines: request.lines,
  };
  return repository.create(command);
}

export async function updateJobWithAccess(
  access: CurrentDoorGoAccess,
  request: Omit<UpdateJobHeaderCommand, 'actorUserId'>,
  repository: JobIntakeRepository = createJobIntakeRepository(),
): Promise<NativeJobAggregate> {
  assertJobsWriteAccess(access);
  if (access.state !== 'active') throw accessFailure(access);
  assertConfirmedJobActiveLineInvariant(request.input.lifecycleStage, request.lines ?? []);
  return repository.update({ ...request, actorUserId: access.user.id });
}

export async function loadCurrentJobs(): Promise<NativeJobAggregate[]> {
  return listJobsWithAccess(await getCurrentDoorGoAccess());
}

export async function loadCurrentJob(internalJobId: string): Promise<NativeJobAggregate | null> {
  return findJobWithAccess(await getCurrentDoorGoAccess(), internalJobId);
}

export function prepareGlassOverrideWithAccess(
  access: CurrentDoorGoAccess,
  request: { line: DoorLineInput; acceptedValues: GlassGeometryValues; reason: string; appliedAt: string },
): GlassOverrideApproval {
  assertJobsWriteAccess(access);
  if (access.state !== 'active') throw accessFailure(access);
  return applyManualGeometryOverride({
    ...request,
    accessLevel: getPermissionAccess(access, 'jobs'),
    actorUserId: access.user.id,
    actorDisplayName: access.profile.displayName,
  });
}

export function removeGlassOverrideWithAccess(access: CurrentDoorGoAccess): null {
  assertJobsWriteAccess(access);
  return removeManualGeometryOverride(getPermissionAccess(access, 'jobs'));
}
