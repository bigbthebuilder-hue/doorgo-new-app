'use server';

import { revalidatePath } from 'next/cache';
import { getPermissionAccess } from '@/lib/auth/access';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { canWriteJobs, jobFailureMessage } from './job-intake-contract';
import { createJobWithAccess, updateJobWithAccess } from './job-intake-service';
import {
  JobIntakeFailure,
  type JobHeaderInput,
  type JobIntakeActionResult,
} from './job-intake-types';

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
}): Promise<JobIntakeActionResult> {
  try {
    const access = await getCurrentDoorGoAccess();
    actionWriteCheck(access);
    const job = await createJobWithAccess(access, request);
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
}): Promise<JobIntakeActionResult> {
  try {
    const access = await getCurrentDoorGoAccess();
    actionWriteCheck(access);
    const job = await updateJobWithAccess(access, request);
    revalidatePath('/jobs');
    revalidatePath(`/jobs/${job.internalJobId}/edit`);
    return { ok: true, job };
  } catch (error) {
    return failureResult(error);
  }
}
