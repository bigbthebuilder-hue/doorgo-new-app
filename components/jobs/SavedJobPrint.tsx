'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSavedJobPrintAction } from '@/lib/jobs/saved-job-print-actions';
import { sendWorkOrderAction } from '@/lib/jobs/work-order-send-actions';
import type { SavedJobPrintKind } from '@/lib/jobs/saved-job-print-contract';
import { DoorLabelDialog } from './DoorLabelDialog';
import { WorkOrderPreview } from './WorkOrderPreview';

export type SavedPrintRequest = { internalJobId: string; kind: SavedJobPrintKind };
export function SavedJobPrint({ request, onClose, onReady }: { request: SavedPrintRequest; onClose: () => void; onReady?: () => void }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadSavedJobPrintAction>> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const notified = useRef(false);
  const readyCallback = useRef(onReady);
  useEffect(() => { readyCallback.current = onReady; }, [onReady]);
  const previewReady = useCallback(() => { if (!notified.current) { notified.current = true; readyCallback.current?.(); } }, []);
  useEffect(() => {
    let cancelled = false;
    void loadSavedJobPrintAction(request.internalJobId, request.kind)
      .catch(() => ({ ok: false as const, message: 'The saved document could not be loaded. Please try again.' }))
      .then(value => { if (!cancelled) setResult(value); });
    return () => { cancelled = true; };
  }, [request.internalJobId, request.kind, attempt]);
  const labelContext = result?.ok && result.context.kind === 'labels' ? result.context : null;
  useEffect(() => { if (!labelContext) dialog.current?.showModal(); }, [labelContext, attempt]);
  if (labelContext) return <DoorLabelDialog job={labelContext.job} onClose={onClose} onReady={previewReady}/>;
  return <dialog aria-label="Saved job printing" className="saved-job-print-dialog" data-saved-job-print onCancel={onClose} ref={dialog}>
    <header><button type="button" className="app-button" onClick={() => { setResult(null); notified.current = false; setAttempt(value => value + 1); }}>Reload latest saved</button><strong>{request.kind === 'labels' ? 'Print Labels' : 'Print Work Order'}</strong><button type="button" className="app-button" onClick={onClose}>Close preview</button></header>
    {!result ? <p role="status">Loading latest saved job…</p> : !result.ok ? <div><p role="alert">{result.message}</p><button className="app-button" type="button" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Retry</button></div> : result.context.kind === 'work-order' ? <WorkOrderPreview {...result.context} canViewCalendar={result.canViewCalendar} initialAction="preview" onReady={previewReady} recipients={result.recipients} recipientDirectoryError={result.recipientDirectoryError} sendWorkOrder={sendWorkOrderAction}/> : null}
  </dialog>;
}
