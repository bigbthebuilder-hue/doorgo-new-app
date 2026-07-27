import 'server-only';

import { getCurrentDoorGoAccess } from '../auth/current-access';
import { createJobIntakeRepository } from './job-intake-repository';
import { createResendWorkOrderEmailProvider, type WorkOrderEmailProvider } from './work-order-email-provider';
import {
  createSupabaseWorkOrderRecipientDirectorySource,
  resolveWorkOrderRecipientsWithAccess,
  type WorkOrderRecipientDirectorySource,
} from './work-order-recipient-directory';
import { generateRevisionPinnedSavedWorkOrderPdfWithAccess } from './work-order-pdf-service-contract';
import { sendAuthenticatedSavedWorkOrder, type WorkOrderSendResult } from './work-order-send-contract';

export async function sendCurrentSavedWorkOrder(
  request: { internalJobId: string; expectedRevision: number; acknowledged: boolean; recipientUserIds: readonly string[] },
  options: {
    directorySource?: WorkOrderRecipientDirectorySource;
    provider?: WorkOrderEmailProvider;
    now?: Date;
  } = {},
): Promise<WorkOrderSendResult> {
  let provider = options.provider;
  let access: Awaited<ReturnType<typeof getCurrentDoorGoAccess>>;
  return sendAuthenticatedSavedWorkOrder(request, {
    async getCurrentAccess() { access = await getCurrentDoorGoAccess(); return access; },
    createSendDependencies: () => ({
      resolveRecipients: (userIds) => resolveWorkOrderRecipientsWithAccess(access, userIds, options.directorySource ?? createSupabaseWorkOrderRecipientDirectorySource()),
      async generatePdf(input) {
      const now = options.now ?? new Date();
      const generated = await generateRevisionPinnedSavedWorkOrderPdfWithAccess(
        access,
        input.internalJobId,
        input.expectedRevision,
        { generatedAt: now.toISOString(), generatedDate: now.toISOString().slice(0, 10) },
        createJobIntakeRepository(),
        input.acknowledged,
      );
      return {
        visibleIdentifier: generated.document.visibleIdentifier,
        pdfFilename: generated.document.pdfFilename,
        bytes: generated.bytes,
      };
    },
      async sendMessage(message) {
      provider ??= createResendWorkOrderEmailProvider();
      return provider.send(message);
      },
    }),
  });
}
