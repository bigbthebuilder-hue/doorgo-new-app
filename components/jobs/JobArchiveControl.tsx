'use client';

import { useState, useTransition } from 'react';

export type JobArchiveTarget = {
  internalJobId: string;
  revision: number;
  visibleIdentifier: string;
};

export type JobArchiveActionResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function jobArchiveTarget(job: {
  internalJobId: string;
  revision: number;
  origin?: 'native' | 'legacy_transfer';
  archivedAt?: string | null;
  bizTrackSalesOrder: string | null;
  doorGoReference: string | null;
  legacyJobId?: string | null;
} | null, canEdit: boolean): JobArchiveTarget | null {
  return canEdit && job?.origin === 'native' && !job.archivedAt ? {
    internalJobId: job.internalJobId,
    revision: job.revision,
    visibleIdentifier: job.bizTrackSalesOrder ?? job.doorGoReference ?? job.legacyJobId ?? '',
  } : null;
}

export function JobArchiveControl({
  target,
  onArchive,
  onNavigate,
}: {
  target: JobArchiveTarget | null;
  onArchive(request: { internalJobId: string; expectedRevision: number; reason: string }): Promise<JobArchiveActionResult>;
  onNavigate(path: '/jobs'): void;
}) {
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  if (!target) return null;

  function closeDialog() {
    if (isPending) return;
    setDialogOpen(false);
    setReason('');
    setMessage('');
  }

  function archive() {
    const archiveReason = reason.trim();
    if (!archiveReason) {
      setMessage('Enter a reason for archiving this job.');
      return;
    }
    setMessage('');
    startTransition(async () => {
      const result = await onArchive({ internalJobId: target!.internalJobId, expectedRevision: target!.revision, reason: archiveReason });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      onNavigate('/jobs');
    });
  }

  return (
    <div className="mt-8 flex border-t border-slate-200 pt-4 dark:border-slate-700 sm:justify-end">
      <button className="min-h-11 rounded-xl border border-rose-500 px-4 font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950" onClick={() => setDialogOpen(true)} type="button">Archive Job</button>
      {dialogOpen ? (
        <div className="app-overlay-workspace flex items-end justify-center bg-slate-950/60 p-3 sm:items-center sm:p-6" onKeyDown={(event) => { if (event.key === 'Escape') closeDialog(); }}>
          <section aria-describedby="archive-job-description archive-job-unsaved-warning" aria-labelledby="archive-job-heading" aria-modal="true" className="max-h-[calc(100vh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-slate-950 shadow-2xl dark:bg-slate-900 dark:text-white sm:p-6" role="dialog">
            <h2 className="text-xl font-bold" id="archive-job-heading">Archive {target.visibleIdentifier}</h2>
            <p className="mt-3 text-sm" id="archive-job-description">Archiving removes this job from the active Jobs list but does not delete it or its lines.</p>
            <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-950 dark:bg-amber-950 dark:text-amber-100" id="archive-job-unsaved-warning">Unrelated unsaved editor changes will not be saved.</p>
            <label className="mt-4 block text-sm font-semibold" htmlFor="archiveJobReason">Archive reason</label>
            <input autoFocus className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-950 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-950 dark:text-white" disabled={isPending} id="archiveJobReason" onChange={(event) => { setReason(event.target.value); setMessage(''); }} placeholder="Required" value={reason}/>
            {message ? <p className="mt-2 rounded-lg bg-rose-50 p-2 text-sm font-semibold text-rose-900 dark:bg-rose-950 dark:text-rose-100" role="status">{message}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button className="min-h-12 rounded-xl border border-slate-300 px-5 font-semibold dark:border-slate-600" disabled={isPending} onClick={closeDialog} type="button">Cancel</button>
              <button className="min-h-12 rounded-xl bg-rose-800 px-5 font-bold text-white disabled:opacity-60" disabled={isPending} onClick={archive} type="button">{isPending ? 'Archiving…' : 'Archive Job'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
