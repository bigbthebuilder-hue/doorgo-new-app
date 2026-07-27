import { getPermissionAccess, type CurrentDoorGoAccess } from '../auth/access';
import { canReadJobs } from './job-intake-contract';
import type { WorkOrderRecipient } from './work-order-recipient-contract';

export const WORK_ORDER_EMAIL_BODY = 'Please find document attached.';

export type WorkOrderEmailMessage = {
  recipient: WorkOrderRecipient;
  fromName: 'DoorGo';
  subject: string;
  body: typeof WORK_ORDER_EMAIL_BODY;
  attachment: { filename: string; bytes: Uint8Array };
};

export type WorkOrderProviderResult = { ok: true; messageId: string } | { ok: false };

export type WorkOrderEmailTransport = {
  send: (input: { from: string; to: string; subject: string; text: string; attachment: { filename: string; bytes: Uint8Array } }) => Promise<{ id?: string | null; error?: unknown }>;
};

export type WorkOrderSendDependencies = {
  resolveRecipients: (userIds: readonly string[]) => Promise<WorkOrderRecipient[]>;
  generatePdf: (input: { internalJobId: string; expectedRevision: number; acknowledged: boolean }) => Promise<{
    visibleIdentifier: string;
    pdfFilename: string;
    bytes: Uint8Array;
  }>;
  sendMessage: (message: WorkOrderEmailMessage) => Promise<WorkOrderProviderResult>;
};

export type WorkOrderSendResult = {
  outcome: 'success' | 'partial' | 'failure';
  attempted: number;
  succeeded: number;
  failed: number;
  failedRecipientUserIds: string[];
  message: string;
};

export type WorkOrderSendRequest = { internalJobId: string; expectedRevision: number; acknowledged: boolean; recipientUserIds: readonly string[] };

export class WorkOrderSendFailure extends Error {
  constructor(public readonly code: 'permission_required' | 'invalid_request' | 'stale_revision' | 'provider_unavailable' | 'send_unavailable', message: string) {
    super(message);
    this.name = 'WorkOrderSendFailure';
  }
}

export function workOrderEmailSubject(visibleIdentifier: string): string {
  return `DoorGo Work Order – ${visibleIdentifier}`;
}

export function validateWorkOrderProviderConfiguration(environment: Record<string, string | undefined>): { apiKey: string; fromAddress: string } {
  const apiKey = environment.RESEND_API_KEY?.trim() ?? '';
  const fromAddress = environment.DOORGO_EMAIL_FROM?.trim() ?? '';
  if (!apiKey || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress) || /[\r\n]/.test(fromAddress)) {
    throw new WorkOrderSendFailure('provider_unavailable', 'Work-order email is not configured.');
  }
  return { apiKey, fromAddress };
}

export function createConfiguredWorkOrderEmailProvider(environment: Record<string, string | undefined>, createTransport: (apiKey: string) => WorkOrderEmailTransport) {
  const { apiKey, fromAddress } = validateWorkOrderProviderConfiguration(environment);
  const transport = createTransport(apiKey);
  return { async send(message: WorkOrderEmailMessage): Promise<WorkOrderProviderResult> {
    try {
      const result = await transport.send({ from: `${message.fromName} <${fromAddress}>`, to: message.recipient.email, subject: message.subject, text: message.body, attachment: { filename: message.attachment.filename, bytes: message.attachment.bytes } });
      return result.error || !result.id ? { ok: false } : { ok: true, messageId: result.id };
    } catch { return { ok: false }; }
  } };
}

export async function sendAuthenticatedSavedWorkOrder(request: Parameters<typeof sendSavedWorkOrder>[1], dependencies: { getCurrentAccess: () => Promise<CurrentDoorGoAccess>; createSendDependencies: () => WorkOrderSendDependencies }): Promise<WorkOrderSendResult> {
  const access = await dependencies.getCurrentAccess();
  return sendSavedWorkOrder(access, request, dependencies.createSendDependencies());
}

export async function handleWorkOrderSendAction(request: WorkOrderSendRequest, send: (request: WorkOrderSendRequest) => Promise<WorkOrderSendResult>, isSafeError: (error: unknown) => error is Error = (error): error is WorkOrderSendFailure => error instanceof WorkOrderSendFailure) {
  try {
    const result = await send(request);
    return { ok: true as const, outcome: result.outcome, message: result.message, failedRecipientUserIds: result.failedRecipientUserIds };
  } catch (error) {
    if (isSafeError(error)) return { ok: false as const, message: error.message };
    return { ok: false as const, message: 'The work-order email could not be sent.' };
  }
}

export function workOrderSendEntryDecision(input: { hasSavedJob: boolean; dirty: boolean; hasUnappliedLineChanges: boolean }):
  | { ok: true }
  | { ok: false; message: string } {
  if (!input.hasSavedJob) return { ok: false, message: 'Save this job once before sending its work order.' };
  if (input.dirty || input.hasUnappliedLineChanges) return { ok: false, message: 'Save the job before sending the work order.' };
  return { ok: true };
}

function assertSendAccess(access: CurrentDoorGoAccess): void {
  if (!canReadJobs(getPermissionAccess(access, 'jobs'))) {
    throw new WorkOrderSendFailure('permission_required', 'Jobs access is required to send this work order.');
  }
}

export async function sendSavedWorkOrder(
  access: CurrentDoorGoAccess,
  request: WorkOrderSendRequest,
  dependencies: WorkOrderSendDependencies,
): Promise<WorkOrderSendResult> {
  assertSendAccess(access);
  if (!request.internalJobId.trim() || !Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 1 || typeof request.acknowledged !== 'boolean') {
    throw new WorkOrderSendFailure('invalid_request', 'The work-order send request is invalid.');
  }

  const recipients = await dependencies.resolveRecipients(request.recipientUserIds);
  const pdf = await dependencies.generatePdf({
    internalJobId: request.internalJobId,
    expectedRevision: request.expectedRevision,
    acknowledged: request.acknowledged,
  });
  const subject = workOrderEmailSubject(pdf.visibleIdentifier);
  const results = await Promise.all(recipients.map(async (recipient) => {
    try {
      const result = await dependencies.sendMessage({
        recipient,
        fromName: 'DoorGo',
        subject,
        body: WORK_ORDER_EMAIL_BODY,
        attachment: { filename: pdf.pdfFilename, bytes: pdf.bytes },
      });
      return { recipient, ok: result.ok };
    } catch {
      return { recipient, ok: false };
    }
  }));
  const failedRecipientUserIds = results.filter((result) => !result.ok).map((result) => result.recipient.userId);
  const succeeded = results.length - failedRecipientUserIds.length;
  const failed = failedRecipientUserIds.length;
  const outcome = succeeded === results.length ? 'success' : succeeded === 0 ? 'failure' : 'partial';
  const message = outcome === 'success'
    ? `Sent to ${succeeded} ${succeeded === 1 ? 'recipient' : 'recipients'}.`
    : outcome === 'failure'
      ? `Email failed for all ${failed} ${failed === 1 ? 'recipient' : 'recipients'}.`
      : `Sent to ${succeeded} of ${results.length} recipients. ${failed} failed.`;
  return { outcome, attempted: results.length, succeeded, failed, failedRecipientUserIds, message };
}
