import 'server-only';

import { Resend } from 'resend';
import { createConfiguredWorkOrderEmailProvider, type WorkOrderEmailMessage, type WorkOrderProviderResult } from './work-order-send-contract';

export type WorkOrderEmailProvider = {
  send: (message: WorkOrderEmailMessage) => Promise<WorkOrderProviderResult>;
};

export function createResendWorkOrderEmailProvider(environment: NodeJS.ProcessEnv = process.env): WorkOrderEmailProvider {
  return createConfiguredWorkOrderEmailProvider(environment, (apiKey) => {
    const resend = new Resend(apiKey);
    return { send: async (input) => {
      const { data, error } = await resend.emails.send({
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        attachments: [{ filename: input.attachment.filename, content: Buffer.from(input.attachment.bytes) }],
      });
      return { id: data?.id, error };
    } };
  });
}
