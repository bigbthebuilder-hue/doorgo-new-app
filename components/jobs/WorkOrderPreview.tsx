'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { buildWorkOrderPdfUrl } from '@/lib/jobs/work-order-preview-contract';
import type { WorkOrderPreflight } from '@/lib/jobs/work-order-preflight-contract';

export function WorkOrderPreview({ internalJobId, sourceRevision, generatedAt, visibleIdentifier, pdfFilename, preflight, initialAction = 'preview' }: {
  internalJobId: string;
  sourceRevision: number;
  generatedAt: string;
  visibleIdentifier: string;
  pdfFilename: string;
  preflight: WorkOrderPreflight;
  initialAction?: 'preview' | 'download' | 'print';
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [acknowledged, setAcknowledged] = useState(!preflight.acknowledgementRequired);
  const allowed = !preflight.blocked && acknowledged;
  const inlineUrl = buildWorkOrderPdfUrl({ internalJobId, sourceRevision, generatedAt, mode: 'inline', acknowledged });
  const downloadUrl = buildWorkOrderPdfUrl({ internalJobId, sourceRevision, generatedAt, mode: 'attachment', acknowledged });
  const automaticActionHandled = useRef(false);
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
            </div>
          </div>
          <p className="mt-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">Preview, download, and print use the same authoritative saved revision.</p>
          {preflight.issues.length ? <section className={`mt-3 rounded-xl border-2 p-3 text-sm ${preflight.blocked ? 'border-rose-700 bg-rose-50 text-rose-950 dark:bg-rose-950 dark:text-rose-100' : 'border-amber-700 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100'}`} aria-labelledby="work-order-preflight-heading"><h2 className="font-bold" id="work-order-preflight-heading">Work-order preflight</h2><ul className="mt-2 list-disc space-y-1 pl-5">{preflight.issues.map((issue, index) => <li key={`${issue.lineIndex ?? 'job'}-${issue.status}-${index}`}><strong>{issue.lineIndex === null ? 'Job' : `Door line ${issue.lineIndex}`} · {issue.status}:</strong> {issue.message}</li>)}</ul>{preflight.blocked ? <p className="mt-3 font-bold">Resolve blocked job or door-line data before previewing, downloading, or printing.</p> : !acknowledged ? <button className="mt-3 min-h-11 rounded-xl bg-amber-800 px-4 font-bold text-white" onClick={() => setAcknowledged(true)} type="button">Acknowledge and Preview</button> : <p className="mt-3 font-bold">Acknowledged for this preview.</p>}</section> : null}
        </header>
        {allowed ? <iframe className="work-order-pdf-frame h-[78vh] min-h-[32rem] w-full rounded-xl border border-slate-300 bg-white shadow-sm dark:border-slate-700" onLoad={() => setReady(true)} ref={frame} src={inlineUrl} title={`Work order ${visibleIdentifier}`}/> : <div className="grid min-h-80 place-items-center rounded-xl border border-slate-300 bg-white p-6 text-center font-semibold dark:border-slate-700 dark:bg-slate-900">Complete the work-order preflight above to load the saved PDF.</div>}
      </div>
    </main>
  );
}
