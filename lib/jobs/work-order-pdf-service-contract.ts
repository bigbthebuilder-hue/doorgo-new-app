import type { CurrentDoorGoAccess } from '../auth/access';
import type { JobIntakeRepository } from './job-intake-types';
import { generateSavedWorkOrderWithAccess } from './work-order-generation-service-contract';
import type { WorkOrderGenerationInput } from './work-order-document-contract';
import { renderWorkOrderPdf, workOrderPdfHeaders } from './work-order-pdf-contract';
import type { WorkOrderOutputMode } from './work-order-preview-contract';
import { assertWorkOrderPreflight } from './work-order-preflight-contract';

export class WorkOrderPdfServiceFailure extends Error {
  constructor(public readonly code: 'stale_revision', message: string) {
    super(message);
    this.name = 'WorkOrderPdfServiceFailure';
  }
}

export async function generateSavedWorkOrderPdfWithAccess(
  access: CurrentDoorGoAccess,
  internalJobId: string,
  generation: WorkOrderGenerationInput,
  mode: WorkOrderOutputMode,
  repository: Pick<JobIntakeRepository, 'findById'>,
  acknowledged = false,
) {
  const document = await generateSavedWorkOrderWithAccess(access, internalJobId, generation, repository);
  assertWorkOrderPreflight(document, acknowledged);
  return { document, bytes: await renderWorkOrderPdf(document), headers: workOrderPdfHeaders(document, mode) };
}

export async function generateRevisionPinnedSavedWorkOrderPdfWithAccess(
  access: CurrentDoorGoAccess,
  internalJobId: string,
  expectedRevision: number,
  generation: WorkOrderGenerationInput,
  repository: Pick<JobIntakeRepository, 'findById'>,
  acknowledged = false,
) {
  const document = await generateSavedWorkOrderWithAccess(access, internalJobId, generation, repository);
  if (document.internalCorrelation.sourceAggregateRevision !== expectedRevision) {
    throw new WorkOrderPdfServiceFailure('stale_revision', 'This saved job changed after the work order was opened. Refresh before sending.');
  }
  assertWorkOrderPreflight(document, acknowledged);
  return { document, bytes: await renderWorkOrderPdf(document) };
}
