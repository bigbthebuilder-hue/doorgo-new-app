import type { CurrentDoorGoAccess } from '../auth/access';
import type { JobIntakeRepository, NativeJobAggregate } from './job-intake-types';
import { JobIntakeFailure } from './job-intake-types';
import { isUuid } from './job-intake-contract';
import { assertSavedWorkOrderAccess, generateSavedWorkOrderWithAccess } from './work-order-generation-service-contract';
import { evaluateWorkOrderPreflight, type WorkOrderPreflight } from './work-order-preflight-contract';

export type SavedJobPrintKind = 'work-order' | 'labels';
export type SavedJobPrintContext = { kind: 'labels'; job: NativeJobAggregate } | {
  kind: 'work-order'; internalJobId: string; sourceRevision: number; visibleIdentifier: string; pdfFilename: string; preflight: WorkOrderPreflight;
};
export async function loadSavedJobPrintWithAccess(access: CurrentDoorGoAccess, internalJobId: string, kind: SavedJobPrintKind, repository: Pick<JobIntakeRepository, 'findById'>): Promise<SavedJobPrintContext> {
  // Same Jobs read authority as existing work-order generation; Calendar access is insufficient.
  assertSavedWorkOrderAccess(access);
  if (!isUuid(internalJobId) || (kind !== 'labels' && kind !== 'work-order')) throw new JobIntakeFailure('not_found', 'The requested saved document was not found.');
  if (kind === 'labels') {
    const job = await repository.findById(internalJobId);
    if (!job) throw new JobIntakeFailure('not_found', 'The requested saved job was not found.');
    return { kind, job };
  }
  const document = await generateSavedWorkOrderWithAccess(access, internalJobId, repository);
  return { kind, internalJobId, sourceRevision: document.internalCorrelation.sourceAggregateRevision, visibleIdentifier: document.visibleIdentifier, pdfFilename: document.pdfFilename, preflight: evaluateWorkOrderPreflight(document) };
}
