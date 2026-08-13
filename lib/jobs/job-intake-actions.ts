'use server';

import { revalidatePath } from 'next/cache';
import { getPermissionAccess } from '@/lib/auth/access';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { canWriteJobs, jobFailureMessage } from './job-intake-contract';
import { assertConfirmedJobActiveLineInvariant, withEffectiveShopHours } from './door-line-contract';
import { archiveJobWithAccess, createJobWithAccess, createTransferredJobWithAccess, prepareGlassOverrideWithAccess, removeGlassOverrideWithAccess, updateJobWithAccess } from './job-intake-service';
import { mapLegacyTransferToUnsavedEditor } from './legacy-transfer-mapping';
import type { LegacyTransferMappingResult } from './legacy-transfer-types';
import {
  JobIntakeFailure,
  type DoorLineInput,
  type GlassGeometryValues,
  type GlassOverrideApproval,
  type JobHeaderInput,
  type JobIntakeActionResult,
} from './job-intake-types';

export type GlassOverrideActionResult =
  | { ok: true; approval: GlassOverrideApproval | null }
  | { ok: false; message: string };

export type LegacyTransferInspectionResult =
  | { ok: true; review: Extract<LegacyTransferMappingResult, { ok: true }> }
  | { ok: false; message: string; issues: { code: string; path: string; message: string }[] };

function failureResult(error: unknown): JobIntakeActionResult {
  if (error instanceof JobIntakeFailure) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      ...(Object.keys(error.fieldErrors).length ? { fieldErrors: error.fieldErrors } : {}),
    };
  }
  return { ok: false, code: 'unavailable', message: jobFailureMessage('unavailable') };
}

function actionWriteCheck(access: Awaited<ReturnType<typeof getCurrentDoorGoAccess>>): void {
  if (access.state === 'unauthenticated') {
    throw new JobIntakeFailure('authentication_required', jobFailureMessage('authentication_required'));
  }
  if (access.state !== 'active') {
    throw new JobIntakeFailure('active_profile_required', jobFailureMessage('active_profile_required'));
  }
  if (!canWriteJobs(getPermissionAccess(access, 'jobs'))) {
    throw new JobIntakeFailure('permission_required', jobFailureMessage('permission_required'));
  }
}

export async function createDraftJobAction(request: {
  commandId: string;
  input: JobHeaderInput;
  lines?: DoorLineInput[];
}): Promise<JobIntakeActionResult> {
  try {
    const access = await getCurrentDoorGoAccess();
    actionWriteCheck(access);
    assertConfirmedJobActiveLineInvariant(request.input.lifecycleStage, request.lines ?? []);
    const job = await createJobWithAccess(access, { ...request, input: withEffectiveShopHours(request.input, request.lines ?? []) });
    revalidatePath('/jobs');
    return { ok: true, job };
  } catch (error) {
    return failureResult(error);
  }
}

export async function inspectLegacyTransferAction(rawPayload: string): Promise<LegacyTransferInspectionResult> {
  try {
    const access = await getCurrentDoorGoAccess();
    actionWriteCheck(access);
    const review = mapLegacyTransferToUnsavedEditor(rawPayload);
    if (!review.ok) return { ok: false, message: 'The selected file is not a valid DoorGo legacy transfer.', issues: review.blockers };
    return { ok: true, review };
  } catch (error) {
    const failed = failureResult(error);
    return { ok: false, message: failed.ok ? jobFailureMessage('unavailable') : failed.message, issues: [] };
  }
}

export async function createTransferredJobAction(request: {
  commandId: string;
  rawPayload: string;
  input: JobHeaderInput;
  lines: DoorLineInput[];
}): Promise<JobIntakeActionResult> {
  try {
    const access = await getCurrentDoorGoAccess();
    actionWriteCheck(access);
    const job = await createTransferredJobWithAccess(access, { ...request, input: withEffectiveShopHours(request.input, request.lines) });
    revalidatePath('/jobs');
    return { ok: true, job };
  } catch (error) {
    return failureResult(error);
  }
}

export async function updateDraftJobAction(request: {
  internalJobId: string;
  expectedRevision: number;
  input: JobHeaderInput;
  lines?: DoorLineInput[];
}): Promise<JobIntakeActionResult> {
  try {
    const access = await getCurrentDoorGoAccess();
    actionWriteCheck(access);
    assertConfirmedJobActiveLineInvariant(request.input.lifecycleStage, request.lines ?? []);
    const job = await updateJobWithAccess(access, { ...request, input: withEffectiveShopHours(request.input, request.lines ?? []) });
    revalidatePath('/jobs');
    revalidatePath(`/jobs/${job.internalJobId}/edit`);
    return { ok: true, job };
  } catch (error) {
    return failureResult(error);
  }
}

export async function archiveDraftJobAction(request: {
  internalJobId: string;
  expectedRevision: number;
  reason: string;
}): Promise<JobIntakeActionResult> {
  try {
    const access = await getCurrentDoorGoAccess();
    actionWriteCheck(access);
    const job = await archiveJobWithAccess(access, request);
    revalidatePath('/jobs');
    return { ok: true, job };
  } catch (error) {
    return failureResult(error);
  }
}

export async function prepareGlassOverrideAction(request: {
  line: DoorLineInput;
  acceptedValues: GlassGeometryValues;
  reason: string;
}): Promise<GlassOverrideActionResult> {
  try {
    const access = await getCurrentDoorGoAccess();
    actionWriteCheck(access);
    if (access.state !== 'active') throw new JobIntakeFailure('permission_required', jobFailureMessage('permission_required'));
    return {
      ok: true,
      approval: prepareGlassOverrideWithAccess(access, {
        line: request.line, acceptedValues: request.acceptedValues, reason: request.reason,
        appliedAt: new Date().toISOString(),
      }),
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Manual override could not be applied.' };
  }
}

export async function removeGlassOverrideAction(): Promise<GlassOverrideActionResult> {
  try {
    const access = await getCurrentDoorGoAccess();
    actionWriteCheck(access);
    return { ok: true, approval: removeGlassOverrideWithAccess(access) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Manual override could not be removed.' };
  }
}
