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
import { mapLegacyTransferToUnsavedEditor } from './legacy-transfer-mapping';
import { unresolvedTransferBlockers } from './legacy-transfer-import-contract';
import {
  JobIntakeFailure,
  type CreateJobHeaderCommand,
  type ArchiveJobCommand,
  type DoorLineInput,
  type GlassGeometryValues,
  type GlassOverrideApproval,
  type JobHeaderInput,
  type JobIntakeRepository,
  type NativeJobListItem,
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
): Promise<NativeJobListItem[]> {
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

export async function createTransferredJobWithAccess(
  access: CurrentDoorGoAccess,
  request: { commandId: string; rawPayload: string; input: JobHeaderInput; lines: DoorLineInput[] },
  repository: JobIntakeRepository = createJobIntakeRepository(),
): Promise<NativeJobAggregate> {
  assertJobsWriteAccess(access);
  if (access.state !== 'active') throw accessFailure(access);
  const mapped = mapLegacyTransferToUnsavedEditor(request.rawPayload);
  if (!mapped.ok) throw new JobIntakeFailure('validation_failed', 'The legacy-transfer file is invalid.', { transferFile: mapped.blockers.map((issue) => issue.message).join(' ') });
  const blockers = unresolvedTransferBlockers(mapped.blockers);
  if (blockers.length) throw new JobIntakeFailure('validation_failed', 'Resolve all legacy-transfer blockers before saving.', { transferFile: blockers.map((issue) => issue.message).join(' ') });
  if (request.lines.length !== mapped.provenance.transferLineIds.length) throw new JobIntakeFailure('validation_failed', 'Imported line identities or ordering changed during review. Re-import the file.');
  const lines = request.lines.map((line, index) => ({ ...line, lineId: mapped.provenance.transferLineIds[index], lineIndex: index + 1, lineStatus: 'Active' as const }));
  assertConfirmedJobActiveLineInvariant(request.input.lifecycleStage, lines);
  const source = mapped.provenance;
  return repository.createTransferred({
    commandId: request.commandId,
    actorUserId: access.user.id,
    defaultSalesperson: access.profile.displayName.trim() || null,
    provenance: {
      direction: 'legacy_to_native', sourceSystem: source.sourceSystem, sourceJobState: 'active',
      transferSchema: source.payloadSchema, transferVersion: source.payloadVersion,
      sourceIdentifierKind: source.sourceIdentifierKind, sourceIdentifierValue: source.sourceIdentifier,
      sourceSavedAt: source.sourceSavedAt, exportedAt: source.exportedAt, sourceFingerprint: source.sourceFingerprint,
    },
    input: request.input,
    lines,
  });
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

export async function archiveJobWithAccess(
  access: CurrentDoorGoAccess,
  request: ArchiveJobCommand,
  repository: JobIntakeRepository = createJobIntakeRepository(),
): Promise<NativeJobAggregate> {
  assertJobsWriteAccess(access);
  return repository.archive(request);
}

export async function loadCurrentJobs(): Promise<NativeJobListItem[]> {
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
