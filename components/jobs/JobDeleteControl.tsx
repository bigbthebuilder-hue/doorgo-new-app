'use client';

import { useState, useTransition } from 'react';

export type JobDeleteTarget = { internalJobId: string; revision: number; visibleIdentifier: string; customer: string | null };
export type JobDeleteActionResult = { ok: true } | { ok: false; code: string; message: string };

export function jobDeleteTarget(job: {
  internalJobId: string; revision: number; visibleIdentifier?: string; bizTrackSalesOrder: string | null;
  doorGoReference: string | null; legacyJobId?: string | null; customer: string | null;
} | null, canPermanentlyDelete: boolean): JobDeleteTarget | null {
  if (!job || !canPermanentlyDelete) return null;
  return { internalJobId: job.internalJobId, revision: job.revision,
    visibleIdentifier: job.visibleIdentifier ?? job.bizTrackSalesOrder ?? job.doorGoReference ?? job.legacyJobId ?? job.internalJobId,
    customer: job.customer };
}

export function JobDeleteControl({ target, onDelete, onNavigate }: {
  target: JobDeleteTarget | null;
  onDelete(request: { internalJobId: string; expectedRevision: number }): Promise<JobDeleteActionResult>;
  onNavigate(path: '/jobs'): void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();
  if (!target) return null;
  const deleteTarget = target;
  const identity = deleteTarget.customer?.trim() ? `${deleteTarget.visibleIdentifier} · ${deleteTarget.customer.trim()}` : deleteTarget.visibleIdentifier;
  function closeDialog() { if (!isPending) { setDialogOpen(false); setMessage(''); } }
  function permanentlyDelete() { setMessage(''); startTransition(async () => {
    const result = await onDelete({ internalJobId: deleteTarget.internalJobId, expectedRevision: deleteTarget.revision });
    if (!result.ok) { setMessage(result.message); return; }
    onNavigate('/jobs');
  }); }
  return <>
    <div className="mt-1 border-t border-rose-200 pt-1 dark:border-rose-900"><button className="app-button w-full justify-start border-rose-300 text-rose-800 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950" onClick={() => setDialogOpen(true)} type="button">Permanently Delete Job</button></div>
    {dialogOpen ? <div className="app-overlay-workspace flex items-end justify-center bg-slate-950/60 p-3 sm:items-center sm:p-6" onKeyDown={(event) => { if (event.key === 'Escape') closeDialog(); }}>
      <section aria-describedby="delete-job-description delete-job-unsaved-warning" aria-labelledby="delete-job-heading" aria-modal="true" className="max-h-[calc(100vh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-slate-950 shadow-2xl dark:bg-slate-900 dark:text-white sm:p-6" role="dialog">
        <h2 className="text-xl font-bold" id="delete-job-heading">Permanently delete {identity}?</h2>
        <p className="mt-3 text-sm" id="delete-job-description">This will permanently remove this job and its associated operational records, including any Production booking history. This cannot be undone.</p>
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-950 dark:bg-amber-950 dark:text-amber-100" id="delete-job-unsaved-warning">Unrelated unsaved editor changes will not be saved.</p>
        {message ? <p className="mt-3 rounded-lg bg-rose-50 p-2 text-sm font-semibold text-rose-900 dark:bg-rose-950 dark:text-rose-100" role="status">{message}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button autoFocus className="min-h-12 rounded-xl border border-slate-300 px-5 font-semibold dark:border-slate-600" disabled={isPending} onClick={closeDialog} type="button">Cancel</button><button className="min-h-12 rounded-xl bg-rose-800 px-5 font-bold text-white disabled:opacity-60" disabled={isPending} onClick={permanentlyDelete} type="button">{isPending ? 'Deleting…' : 'Delete Job Permanently'}</button></div>
      </section>
    </div> : null}
  </>;
}
