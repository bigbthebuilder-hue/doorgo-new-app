import type { CurrentDoorGoAccess } from '../auth/access';
import type { JobIntakeRepository } from './job-intake-types';
import { generateSavedWorkOrderWithAccess } from './work-order-generation-service-contract';
import type { WorkOrderGenerationInput } from './work-order-document-contract';
import { renderWorkOrderPdf, workOrderPdfHeaders } from './work-order-pdf-contract';
import type { WorkOrderOutputMode } from './work-order-preview-contract';
import { assertWorkOrderPreflight } from './work-order-preflight-contract';

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
