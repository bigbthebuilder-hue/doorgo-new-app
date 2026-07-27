'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { AppConfirmationToast, type AppConfirmationToastMessage } from '@/components/AppConfirmationToast';
import { buildWorkOrderPdfUrl } from '@/lib/jobs/work-order-preview-contract';
import type { WorkOrderPreflight } from '@/lib/jobs/work-order-preflight-contract';
import type { WorkOrderRecipient } from '@/lib/jobs/work-order-recipient-contract';
import { workOrderEmailSubject } from '@/lib/jobs/work-order-send-contract';

export type WorkOrderSendCallback = (request: { internalJobId: string; expectedRevision: number; acknowledged: boolean; recipientUserIds: string[] }) => Promise<{ ok: true; outcome: 'success' | 'partial' | 'failure'; message: string; failedRecipientUserIds: string[] } | { ok: false; message: string }>;

export function WorkOrderPreview({ internalJobId, sourceRevision, generatedAt, visibleIdentifier, pdfFilename, preflight, recipients, recipientDirectoryError, sendWorkOrder, initialAction = 'preview' }: {
  internalJobId: string;
  sourceRevision: number;
  generatedAt: string;
  visibleIdentifier: string;
  pdfFilename: string;
  preflight: WorkOrderPreflight;
  recipients: WorkOrderRecipient[];
  recipientDirectoryError: string | null;
  sendWorkOrder: WorkOrderSendCallback;
  initialAction?: 'preview' | 'download' | 'print' | 'send';
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [acknowledged, setAcknowledged] = useState(!preflight.acknowledgementRequired);
  const [sendOpen, setSendOpen] = useState(initialAction === 'send');
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [sendError, setSendError] = useState<string | null>(recipientDirectoryError);
  const [toast, setToast] = useState<AppConfirmationToastMessage | null>(null);
  const [sending, startSending] = useTransition();
  const allowed = !preflight.blocked && acknowledged;
  const inlineUrl = buildWorkOrderPdfUrl({ internalJobId, sourceRevision, generatedAt, mode: 'inline', acknowledged });
  const downloadUrl = buildWorkOrderPdfUrl({ internalJobId, sourceRevision, generatedAt, mode: 'attachment', acknowledged });
  const subject = workOrderEmailSubject(visibleIdentifier);
  const automaticActionHandled = useRef(false);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (automaticActionHandled.current || !allowed) return;
    if (initialAction === 'download') {
      automaticActionHandled.current = true;
      window.location.assign(downloadUrl);
    } else if (initialAction === 'print' && ready) {
      automaticActionHandled.current = true;
      frame.current?.contentWindow?.print();
    }
  }, [allowed, downloadUrl, initialAction, ready]);

  function toggleRecipient(userId: string) {
    setSelectedRecipientIds((current) => current.includes(userId) ? current.filter((value) => value !== userId) : [...current, userId]);
    setSendError(null);
  }

  function submitSend() {
    if (!allowed || sending) return;
    if (!selectedRecipientIds.length) {
      setSendError('Select at least one recipient.');
      return;
    }
    setSendError(null);
    startSending(async () => {
      const result = await sendWorkOrder({
        internalJobId,
        expectedRevision: sourceRevision,
        acknowledged,
        recipientUserIds: selectedRecipientIds,
      });
      if (!result.ok) {
        setSendError(result.message);
        setToast({ id: Date.now(), tone: 'error', text: result.message });
        return;
      }
      const tone = result.outcome === 'success' ? 'success' : 'error';
      setToast({ id: Date.now(), tone, text: result.message });
      if (result.outcome === 'success') {
        setSendOpen(false);
        setSelectedRecipientIds([]);
      } else {
        setSelectedRecipientIds(result.failedRecipientUserIds);
        setSendError(result.outcome === 'partial' ? 'Some recipients failed. The failed recipients remain selected for retry.' : result.message);
      }
    });
  }

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-5">
      <div className="mx-auto max-w-7xl">
        <header className="work-order-preview-controls mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Saved Work Order</p><h1 className="mt-1 text-2xl font-semibold">{visibleIdentifier}</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{pdfFilename} · Generated from saved revision {sourceRevision}</p></div>
            <div className="flex flex-wrap gap-2">
              <Link className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 font-semibold dark:border-slate-600" href={`/jobs/${internalJobId}/edit`}>Back to Job</Link>
              {allowed ? <a className="inline-flex min-h-11 items-center rounded-xl bg-sky-700 px-4 font-semibold text-white" download={pdfFilename} href={downloadUrl}>Download PDF</a> : <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-xl bg-sky-700 px-4 font-semibold text-white opacity-50">Download PDF</span>}
              <button className="min-h-11 rounded-xl bg-slate-900 px-4 font-semibold text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900" disabled={!ready || !allowed} onClick={() => frame.current?.contentWindow?.print()} type="button">Print</button>
              <button className="min-h-11 rounded-xl border border-sky-700 px-4 font-semibold text-sky-800 disabled:opacity-50 dark:text-sky-200" disabled={!allowed} onClick={() => { setSendOpen((current) => !current); setSendError(recipientDirectoryError); }} type="button">Send</button>
            </div>
          </div>
          <p className="mt-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">Preview, download, print, and Send use the same authoritative saved revision.</p>
          {preflight.issues.length ? <section className={`mt-3 rounded-xl border-2 p-3 text-sm ${preflight.blocked ? 'border-rose-700 bg-rose-50 text-rose-950 dark:bg-rose-950 dark:text-rose-100' : 'border-amber-700 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100'}`} aria-labelledby="work-order-preflight-heading"><h2 className="font-bold" id="work-order-preflight-heading">Work-order preflight</h2><ul className="mt-2 list-disc space-y-1 pl-5">{preflight.issues.map((issue, index) => <li key={`${issue.lineIndex ?? 'job'}-${issue.status}-${index}`}><strong>{issue.lineIndex === null ? 'Job' : `Door line ${issue.lineIndex}`} · {issue.status}:</strong> {issue.message}</li>)}</ul>{preflight.blocked ? <p className="mt-3 font-bold">Resolve blocked job or door-line data before previewing, downloading, printing, or sending.</p> : !acknowledged ? <button className="mt-3 min-h-11 rounded-xl bg-amber-800 px-4 font-bold text-white" onClick={() => setAcknowledged(true)} type="button">Acknowledge and Preview</button> : <p className="mt-3 font-bold">Acknowledged for this preview and Send.</p>}</section> : null}
          {sendOpen ? <section className="mt-3 rounded-xl border border-slate-300 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-950" aria-labelledby="send-work-order-heading">
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold" id="send-work-order-heading">Send Work Order</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Choose active DoorGo users. Each recipient receives a separate email.</p></div><button className="font-semibold text-slate-600 dark:text-slate-300" onClick={() => setSendOpen(false)} type="button">Close</button></div>
            <fieldset className="mt-3 grid gap-2 sm:grid-cols-2"><legend className="mb-2 font-semibold">Recipients</legend>{recipients.map((recipient) => <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-300 bg-white p-3 dark:border-slate-600 dark:bg-slate-900" key={recipient.userId}><input checked={selectedRecipientIds.includes(recipient.userId)} className="size-5" disabled={sending} onChange={() => toggleRecipient(recipient.userId)} type="checkbox"/><span><strong className="block">{recipient.displayName}</strong><span className="text-sm text-slate-600 dark:text-slate-300">{recipient.email}</span></span></label>)}</fieldset>
            {!recipients.length ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">{recipientDirectoryError ?? 'No active DoorGo recipients are available.'}</p> : null}
            <dl className="mt-4 grid gap-2 rounded-xl bg-white p-3 text-sm dark:bg-slate-900"><div><dt className="font-semibold">Subject</dt><dd>{subject}</dd></div><div><dt className="font-semibold">Attachment</dt><dd>{pdfFilename}</dd></div>{preflight.issues.length ? <div><dt className="font-semibold">Warnings</dt><dd>{preflight.issues.map((issue) => issue.message).join(' | ')}</dd></div> : null}</dl>
            {sendError ? <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-900 dark:bg-rose-950 dark:text-rose-100" role="alert">{sendError}</p> : null}
            <button className="mt-4 min-h-12 rounded-xl bg-sky-700 px-5 font-bold text-white disabled:opacity-50" disabled={sending || !allowed || !recipients.length} onClick={submitSend} type="button">{sending ? 'Sending…' : 'Send Email'}</button>
          </section> : null}
        </header>
        {allowed ? <iframe className="work-order-pdf-frame h-[78vh] min-h-[32rem] w-full rounded-xl border border-slate-300 bg-white shadow-sm dark:border-slate-700" onLoad={() => setReady(true)} ref={frame} src={inlineUrl} title={`Work order ${visibleIdentifier}`}/> : <div className="grid min-h-80 place-items-center rounded-xl border border-slate-300 bg-white p-6 text-center font-semibold dark:border-slate-700 dark:bg-slate-900">Complete the work-order preflight above to load the saved PDF.</div>}
      </div>
      <AppConfirmationToast message={toast} onDismiss={dismissToast}/>
    </main>
  );
}
