import type { JobIntakeRepository, NativeJobListRequest } from '../jobs/job-intake-types';

export async function loadNativeJobLinksByVisibleIdentifier(
  visibleIdentifiers: string[],
  repository: JobIntakeRepository,
): Promise<Map<string, string>> {
  const remaining = new Set(visibleIdentifiers);
  const links = new Map<string, string>();
  let cursor: NativeJobListRequest['cursor'];

  while (remaining.size) {
    const page = await repository.listPage({ limit: 100, cursor });

    for (const job of page.items) {
      if (typeof job.visibleIdentifier !== 'string' || typeof job.internalJobId !== 'string') continue;
      if (!remaining.has(job.visibleIdentifier)) continue;
      links.set(job.visibleIdentifier, job.internalJobId);
      remaining.delete(job.visibleIdentifier);
    }

    if (!page.page.hasMore || !page.page.nextCursor) break;
    cursor = page.page.nextCursor;
  }

  return links;
}
