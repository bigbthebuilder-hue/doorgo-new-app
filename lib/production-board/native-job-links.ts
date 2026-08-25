import type { JobIntakeRepository, NativeJobListRequest } from '../jobs/job-intake-types';

export type NativeJobLink = {
  internalJobId: string;
  salesOrder: string | null;
  customer: string | null;
};

export type CalendarNativeJobLinks = {
  byVisibleIdentifier: Map<string, NativeJobLink>;
  byInternalJobId: Map<string, NativeJobLink>;
};

export async function loadNativeJobLinksByVisibleIdentifier(
  visibleIdentifiers: string[],
  repository: JobIntakeRepository,
): Promise<Map<string, NativeJobLink>> {
  return (await loadCalendarNativeJobLinks(visibleIdentifiers, [], repository)).byVisibleIdentifier;
}

export async function loadCalendarNativeJobLinks(
  visibleIdentifiers: string[],
  internalJobIds: string[],
  repository: JobIntakeRepository,
): Promise<CalendarNativeJobLinks> {
  const remainingVisible = new Set(visibleIdentifiers);
  const remainingInternal = new Set(internalJobIds);
  const byVisibleIdentifier = new Map<string, NativeJobLink>();
  const byInternalJobId = new Map<string, NativeJobLink>();
  let cursor: NativeJobListRequest['cursor'];

  while (remainingVisible.size || remainingInternal.size) {
    const page = await repository.listPage({ limit: 100, cursor });

    for (const job of page.items) {
      if (typeof job.visibleIdentifier !== 'string' || typeof job.internalJobId !== 'string') continue;
      if (!remainingVisible.has(job.visibleIdentifier) && !remainingInternal.has(job.internalJobId)) continue;
      const link = {
        internalJobId: job.internalJobId,
        salesOrder: job.bizTrackSalesOrder,
        customer: job.customer,
      };
      if (remainingVisible.delete(job.visibleIdentifier)) byVisibleIdentifier.set(job.visibleIdentifier, link);
      if (remainingInternal.delete(job.internalJobId)) byInternalJobId.set(job.internalJobId, link);
    }

    if (!page.page.hasMore || !page.page.nextCursor) break;
    cursor = page.page.nextCursor;
  }

  return { byVisibleIdentifier, byInternalJobId };
}
