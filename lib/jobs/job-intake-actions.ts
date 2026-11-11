'use server';

import { revalidatePath } from 'next/cache';
import { saveHostedDoorLineLabels } from './hosted-job-intake-repository';
import type { DoorLabelSaveRequest } from './door-label-save-contract';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { salesOrderIsDuplicate, type SalesOrderCheckResult } from './sales-order-check-contract';
import { createJobIntakeRepository } from './job-intake-repository';
import { getPermissionAccess } from '@/lib/auth/access';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { canWriteJobs, isUuid, jobFailureMessage } from './job-intake-contract';
import { assertConfirmedJobActiveLineInvariant, withEffectiveShopHours } from './door-line-contract';
import { archiveJobWithAccess, findJobWithAccess, createJobWithAccess, createTransferredJobWithAccess, deleteJobWithAccess, prepareGlassOverrideWithAccess, removeGlassOverrideWithAccess, updateJobWithAccess } from './job-intake-service';
import { mapLegacyTransferToUnsavedEditor } from './legacy-transfer-mapping';
import type { LegacyTransferMappingResult } from './legacy-transfer-types';
import { loadShopDateIndicators } from './shop-date-capacity-queries';
import type { ShopDateIndicators } from './shop-date-capacity';
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

export async function saveDoorLineLabelsAction(request: DoorLabelSaveRequest): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    actionWriteCheck(await getCurrentDoorGoAccess());
    await saveHostedDoorLineLabels(await createAuthenticatedSupabaseServerClient(), request);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof JobIntakeFailure ? error.message : 'DoorGo could not save the door labels. Please try again.' };
  }
}

export async function loadShopDateAvailabilityAction(
  month: string,
  internalJobId: string | null,
  estimatedHours: number | null,
): Promise<ShopDateIndicators | null> {
  if (typeof month !== 'string' || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) return null;
  if (internalJobId !== null && (typeof internalJobId !== 'string' || !isUuid(internalJobId))) return null;
  try {
    const access = await getCurrentDoorGoAccess();
    actionWriteCheck(access);
    if (getPermissionAccess(access, 'calendar') !== 'use') return null;
    if (estimatedHours !== null && (typeof estimatedHours !== 'number' || !Number.isFinite(estimatedHours)
        || estimatedHours < 0 || !Number.isSafeInteger(Math.round(estimatedHours * 100)))) return null;
    const job = internalJobId ? await findJobWithAccess(access, internalJobId.toLowerCase()) : null;
    if (internalJobId && (!job || job.archivedAt || job.internalJobId !== internalJobId.toLowerCase())) return null;
    return await loadShopDateIndicators(month, job?.internalJobId ?? null, estimatedHours);
  } catch {
    return null;
  }
}

export async function checkSalesOrderAction(value: string, internalJobId?: string): Promise<SalesOrderCheckResult> {
  try {
    actionWriteCheck(await getCurrentDoorGoAccess());
    return { ok: true, duplicate: await salesOrderIsDuplicate(createJobIntakeRepository(), value, internalJobId) };
  } catch {
    return { ok: false, message: 'Could not check Sales Order. Leave the field again to retry.' };
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

export async function deleteDraftJobAction(request: {
  internalJobId: string;
  expectedRevision: number;
}): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  try {
    const access = await getCurrentDoorGoAccess();
    await deleteJobWithAccess(access, request);
    revalidatePath('/jobs');
    return { ok: true };
  } catch (error) {
    const failed = failureResult(error);
    return failed.ok ? { ok: false, code: 'unavailable', message: jobFailureMessage('unavailable') } : failed;
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
