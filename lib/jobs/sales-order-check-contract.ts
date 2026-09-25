import { normalizeSalesOrder } from './job-intake-contract';
import type { JobIntakeRepository, NativeJobListCursor } from './job-intake-types';

export type SalesOrderCheckResult = { ok: true; duplicate: boolean } | { ok: false; message: string };

// Read the existing header repository, including archived owners. The database
// unique index and create/update RPCs remain the final authority at save time.
export async function salesOrderIsDuplicate(
  repository: Pick<JobIntakeRepository, 'listPage'>,
  value: string,
  internalJobId?: string,
): Promise<boolean> {
  const salesOrder = normalizeSalesOrder(value);
  if (salesOrder === null) return false;
  let cursor: NativeJobListCursor | undefined;
  do {
    const result = await repository.listPage({ includeArchived: true, limit: 100, cursor });
    // Match dg_native_jobs_sales_order_unique: lower(btrim(biztrack_sales_order)).
    if (result.items.some((job) => job.internalJobId !== internalJobId
      && normalizeSalesOrder(job.bizTrackSalesOrder)?.toLowerCase() === salesOrder.toLowerCase())) return true;
    cursor = result.page.nextCursor ?? undefined;
  } while (cursor);
  return false;
}
