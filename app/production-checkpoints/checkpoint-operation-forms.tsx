'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmProductionFlowCheckpoint, removeProductionFlowCheckpoint, reviseProductionFlowCheckpoint } from '@/lib/production-flow/checkpoint-actions';
import {
  buildConfirmRequest, buildReconfirmRequest, buildRemoveRequest, buildReviseRequest,
  checkpointActionMessage, commandForSubmission, type CheckpointCurrentState, type RetryCommandState,
} from '@/lib/production-flow/checkpoint-page-contract';

type Props = { state: CheckpointCurrentState; productionDate: string; calculatedCarryHours: number | null };
const inputClass = 'min-h-12 rounded-xl border border-slate-300 px-3 text-lg focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200';

function parseHours(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const hours = Number(value); return Number.isFinite(hours) && hours >= 0 && hours <= 99_999_999.99 ? hours : null;
}

export function CheckpointOperationForms({ state, productionDate, calculatedCarryHours }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; operation: 'confirm' | 'revise' | 'remove' | 'reconfirm'; message: string } | null>(null);
  const retry = useRef<RetryCommandState>({ commandId: crypto.randomUUID(), submittedFingerprint: null });

  useEffect(() => {
    if (feedback?.kind !== 'success') return;
    const timer = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const submit = async (operation: 'confirm' | 'revise' | 'remove' | 'reconfirm', form: HTMLFormElement) => {
    const data = new FormData(form); const fingerprint = JSON.stringify(Array.from(data.entries()));
    retry.current = commandForSubmission(retry.current, fingerprint, () => crypto.randomUUID());
    const actualText = data.get('actualCarry'); const noteValue = data.get('note'); const reasonValue = data.get('removalReason');
    const note = typeof noteValue === 'string' ? noteValue : null; const reason = typeof reasonValue === 'string' ? reasonValue : '';
    const actual = typeof actualText === 'string' ? parseHours(actualText) : null;
    if (operation !== 'remove' && actual === null) { setFeedback({ kind: 'error', operation, message: 'Enter actual carry using no more than two decimal places.' }); return; }
    if (operation === 'remove' && !reason.trim()) { setFeedback({ kind: 'error', operation, message: 'Enter a reason for removing this checkpoint.' }); return; }
    setPending(true); setFeedback(null);
    const result = operation === 'remove'
      ? state.current ? await removeProductionFlowCheckpoint(buildRemoveRequest({ commandId: retry.current.commandId, productionDate, expectedCheckpointId: state.current.checkpointId, expectedRevisionNumber: state.current.revisionNumber, removalReason: reason })) : null
      : actual === null ? null
        : operation === 'confirm' ? await confirmProductionFlowCheckpoint(buildConfirmRequest({ commandId: retry.current.commandId, productionDate, openingCarryHours: actual, calculatedOpeningCarrySnapshot: calculatedCarryHours, note }))
          : operation === 'reconfirm' ? await confirmProductionFlowCheckpoint(buildReconfirmRequest({ commandId: retry.current.commandId, productionDate, openingCarryHours: actual, calculatedOpeningCarrySnapshot: calculatedCarryHours, note }))
            : state.current ? await reviseProductionFlowCheckpoint(buildReviseRequest({ commandId: retry.current.commandId, productionDate, openingCarryHours: actual, calculatedOpeningCarrySnapshot: calculatedCarryHours, note, expectedCheckpointId: state.current.checkpointId, expectedRevisionNumber: state.current.revisionNumber })) : null;
    setPending(false);
    if (!result) { setFeedback({ kind: 'error', operation, message: 'The checkpoint is no longer available. The latest history has been loaded.' }); router.refresh(); return; }
    if (!result.ok) {
      setFeedback({ kind: 'error', operation, message: checkpointActionMessage(result.code) });
      if (['stale_revision', 'not_found', 'already_confirmed'].includes(result.code)) router.refresh();
      if (['permission_required', 'authentication_required', 'active_profile_required'].includes(result.code)) router.replace('/account');
      return;
    }
    retry.current = { commandId: crypto.randomUUID(), submittedFingerprint: null };
    setFeedback({ kind: 'success', operation, message: 'Checkpoint saved.' }); router.refresh();
  };

  const form = (operation: 'confirm' | 'revise' | 'reconfirm', title: string) => (
    <form className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" onSubmit={(event) => { event.preventDefault(); void submit(operation, event.currentTarget); }}>
      <h2 className="text-xl font-semibold">{title}</h2>
      <label className="grid gap-2 font-medium">Actual carry<input className={inputClass} name="actualCarry" type="text" inputMode="decimal" defaultValue={operation === 'revise' ? state.current?.actualOpeningCarryHours.toFixed(2) : ''} required aria-describedby="actual-carry-help"/></label>
      <p id="actual-carry-help" className="text-xs text-slate-500">Enter the unfinished shop hours, using up to two decimal places.</p>
      <label className="grid gap-2 font-medium">Optional note<textarea className="min-h-24 rounded-xl border border-slate-300 p-3 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200" name="note" maxLength={500} defaultValue={operation === 'revise' ? state.current?.note ?? '' : ''}/></label>
      <button className="min-h-12 rounded-xl bg-sky-700 px-5 font-semibold text-white disabled:opacity-60" type="submit" disabled={pending}>{pending ? 'Saving…' : title}</button>
      {feedback?.kind === 'error' && feedback.operation === operation ? <p className="text-sm text-rose-700" aria-live="polite">{feedback.message}</p> : null}
    </form>
  );

  const success = feedback?.kind === 'success' ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900" aria-live="polite">{feedback.message}</p> : null;
  if (state.kind === 'empty') return <div className="grid gap-4">{success}{form('confirm', 'Confirm checkpoint')}</div>;
  if (state.kind === 'removed') return <div className="grid gap-4">{success}{form('reconfirm', 'Reconfirm checkpoint')}</div>;
  return <div className="grid gap-4">{success}{form('revise', 'Revise checkpoint')}<form className="grid gap-4 rounded-2xl border border-rose-200 bg-white p-5 shadow-sm" onSubmit={(event) => { event.preventDefault(); void submit('remove', event.currentTarget); }}><h2 className="text-xl font-semibold text-rose-900">Remove checkpoint</h2><p className="text-sm text-slate-600">This records a removal in the checkpoint history. It does not delete earlier revisions.</p><label className="grid gap-2 font-medium">Reason<textarea className="min-h-24 rounded-xl border border-slate-300 p-3 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-200" name="removalReason" maxLength={500} required/></label><label className="flex min-h-12 items-center gap-3 rounded-xl bg-rose-50 p-3 text-sm font-medium"><input className="size-5" type="checkbox" required/>I confirm that this checkpoint should be removed.</label><button className="min-h-12 rounded-xl bg-rose-700 px-5 font-semibold text-white disabled:opacity-60" type="submit" disabled={pending}>{pending ? 'Removing…' : 'Remove checkpoint'}</button>{feedback?.kind === 'error' && feedback.operation === 'remove' ? <p className="text-sm text-rose-700" aria-live="polite">{feedback.message}</p> : null}</form></div>;
}
