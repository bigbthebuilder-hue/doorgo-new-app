import 'server-only';

import { getCurrentDoorGoAccess } from '../auth/current-access';
import { createJobIntakeRepository } from './job-intake-repository';
import { generateSavedWorkOrderWithAccess } from './work-order-generation-service-contract';
import type { WorkOrderDocument, WorkOrderGenerationInput } from './work-order-document-contract';

/** Generates only from the repository-saved aggregate. Callers must reject dirty editor state. */
export async function generateCurrentSavedWorkOrder(
  internalJobId: string,
  generation: WorkOrderGenerationInput,
): Promise<WorkOrderDocument> {
  return generateSavedWorkOrderWithAccess(
    await getCurrentDoorGoAccess(), internalJobId, generation, createJobIntakeRepository(),
  );
}
