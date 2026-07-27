'use server';

import { JobIntakeFailure } from './job-intake-types';
import { WorkOrderRecipientFailure } from './work-order-recipient-contract';
import { WorkOrderPdfServiceFailure } from './work-order-pdf-service-contract';
import { handleWorkOrderSendAction, WorkOrderSendFailure } from './work-order-send-contract';
import { sendCurrentSavedWorkOrder } from './work-order-send-service';

export async function sendWorkOrderAction(request: {
  internalJobId: string;
  expectedRevision: number;
  acknowledged: boolean;
  recipientUserIds: string[];
}): Promise<
  | { ok: true; outcome: 'success' | 'partial' | 'failure'; message: string; failedRecipientUserIds: string[] }
  | { ok: false; message: string }
> {
  return handleWorkOrderSendAction(request, sendCurrentSavedWorkOrder, (error): error is Error =>
    error instanceof WorkOrderRecipientFailure || error instanceof WorkOrderPdfServiceFailure || error instanceof WorkOrderSendFailure || error instanceof JobIntakeFailure);
}
