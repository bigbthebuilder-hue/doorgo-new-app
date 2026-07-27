'use client';

import { workOrderSendEntryDecision } from '@/lib/jobs/work-order-send-contract';

export function WorkOrderSendEntryButton({ hasSavedJob, dirty, hasUnappliedLineChanges, disabled, onOpen, onBlocked }: { hasSavedJob: boolean; dirty: boolean; hasUnappliedLineChanges: boolean; disabled?: boolean; onOpen: () => void; onBlocked: (message: string) => void }) {
  return <button className="min-h-12 rounded-xl border border-sky-700 px-5 font-semibold text-sky-800 dark:text-sky-200" disabled={disabled} onClick={() => {
    const decision = workOrderSendEntryDecision({ hasSavedJob, dirty, hasUnappliedLineChanges });
    if (!decision.ok) { onBlocked(decision.message); return; }
    onOpen();
  }} type="button">Send Work Order</button>;
}
