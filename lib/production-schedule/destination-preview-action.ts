'use server';

import type { ProductionScheduleDestinationPreviewResult } from './move-ui-contract';
import {
  loadProductionScheduleDestinationPreview,
  type ProductionScheduleDestinationPreviewRequest,
} from './destination-preview-service';

export async function previewProductionScheduleDestination(
  request: ProductionScheduleDestinationPreviewRequest,
): Promise<ProductionScheduleDestinationPreviewResult> {
  return loadProductionScheduleDestinationPreview(request);
}
