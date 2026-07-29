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
  doorGoReference: string;
} | null, canEdit: boolean): JobArchiveTarget | null {
  return canEdit && job?.origin === 'native' && !job.archivedAt ? {
    internalJobId: job.internalJobId,
    revision: job.revision,
    visibleIdentifier: job.bizTrackSalesOrder ?? job.doorGoReference,
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
  const [isPending, startTransition] = useTransition();
  if (!target) return null;

  function archive() {
    const archiveReason = reason.trim();
    if (!archiveReason) {
      setMessage('Enter a reason for archiving this job.');
      return;
    }
    if (!window.confirm(`Archive ${target!.visibleIdentifier}? This removes the job from the normal active Jobs list but does not delete it. Unrelated unsaved editor changes will not be saved.`)) return;
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
    <section aria-labelledby="archive-job-heading" className="mt-8 rounded-xl border-2 border-rose-300 bg-rose-50 p-4 text-rose-950 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">
      <h2 className="font-bold" id="archive-job-heading">Job archive</h2>
      <p className="mt-1 text-sm">Archiving removes this job from the normal active Jobs list. It does not delete the job or its lines.</p>
      <label className="mt-3 block text-sm font-semibold" htmlFor="archiveJobReason">Archive reason</label>
      <input className="mt-1 min-h-12 w-full rounded-xl border border-rose-300 bg-white px-3 text-slate-950 disabled:opacity-60 dark:border-rose-700 dark:bg-slate-950 dark:text-white" disabled={isPending} id="archiveJobReason" onChange={(event) => { setReason(event.target.value); setMessage(''); }} placeholder="Required" value={reason}/>
      {message ? <p className="mt-2 rounded-lg bg-white/70 p-2 text-sm font-semibold dark:bg-slate-950/60" role="status">{message}</p> : null}
      <button className="mt-3 min-h-12 rounded-xl bg-rose-800 px-5 font-bold text-white disabled:opacity-60" disabled={isPending} onClick={archive} type="button">{isPending ? 'Archiving…' : 'Archive Job'}</button>
    </section>
  );
}
