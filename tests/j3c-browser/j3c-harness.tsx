import { useState } from 'react';
import { WorkOrderSendEntryButton } from '@/components/jobs/WorkOrderSendEntryButton';
import { WorkOrderPreview, type WorkOrderSendCallback } from '@/components/jobs/WorkOrderPreview';
import { hasAtLeastView } from '@/lib/auth/access';
import type { WorkOrderPreflight } from '@/lib/jobs/work-order-preflight-contract';
import type { WorkOrderRecipient } from '@/lib/jobs/work-order-recipient-contract';
import { accessFixture, clearPreflight, J3C_HARNESS_ONLY_MARKER, recipients as defaultRecipients } from './j3c-fixtures';

declare global { interface Window { __j3cRequests?: unknown[] } }
export type HarnessOutcome = 'success' | 'failure' | 'partial' | 'stale' | 'delayed-success' | 'failure-then-success';

export function J3CBrowserHarness({ accessLevel = 'view', manager = false, preflight = clearPreflight, recipients = defaultRecipients, directoryError = null, outcome = 'success', visibleIdentifier = 'SO-900', pdfFilename = 'Work_Order_SO-900.pdf' }: { accessLevel?: 'none' | 'view' | 'use'; manager?: boolean; preflight?: WorkOrderPreflight; recipients?: WorkOrderRecipient[]; directoryError?: string | null; outcome?: HarnessOutcome; visibleIdentifier?: string; pdfFilename?: string }) {
  const access = accessFixture(accessLevel, manager);
  const [attempt, setAttempt] = useState(0);
  if (!hasAtLeastView(access, 'jobs')) return <main data-testid={J3C_HARNESS_ONLY_MARKER}><p>Jobs access is required.</p></main>;
  const sendWorkOrder: WorkOrderSendCallback = async (request) => {
    window.__j3cRequests = [...(window.__j3cRequests ?? []), structuredClone(request)];
    const nextAttempt = attempt + 1; setAttempt(nextAttempt);
    if (outcome === 'delayed-success') await new Promise((resolve) => setTimeout(resolve, 350));
    if (outcome === 'stale') return { ok: false, message: 'This saved job changed after the work order was opened. Refresh before sending.' };
    if (outcome === 'failure' || (outcome === 'failure-then-success' && nextAttempt === 1)) return { ok: true, outcome: 'failure', message: `Email failed for all ${request.recipientUserIds.length} recipients.`, failedRecipientUserIds: [...request.recipientUserIds] };
    if (outcome === 'partial') return { ok: true, outcome: 'partial', message: `Sent to 1 of ${request.recipientUserIds.length} recipients. 1 failed.`, failedRecipientUserIds: [request.recipientUserIds.at(-1)!] };
    return { ok: true, outcome: 'success', message: `Sent to ${request.recipientUserIds.length} ${request.recipientUserIds.length === 1 ? 'recipient' : 'recipients'}.`, failedRecipientUserIds: [] };
  };
  return <div data-testid={J3C_HARNESS_ONLY_MARKER}><WorkOrderPreview internalJobId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" pdfFilename={pdfFilename} preflight={preflight} recipientDirectoryError={directoryError} recipients={recipients} sendWorkOrder={sendWorkOrder} sourceRevision={7} visibleIdentifier={visibleIdentifier}/></div>;
}

export function DirtySendEntryHarness({ dirty }: { dirty: boolean }) {
  const [result, setResult] = useState('idle');
  return <div><WorkOrderSendEntryButton dirty={dirty} hasSavedJob hasUnappliedLineChanges={false} onBlocked={(message) => setResult(message)} onOpen={() => setResult('opened')}/><output aria-live="polite">{result}</output></div>;
}
