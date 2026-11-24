'use client';

import Link from 'next/link';
import { SavedJobPrint, type SavedPrintRequest } from './SavedJobPrint';
import { useMemo, useState } from 'react';
import { visibleJobIdentifier } from '@/lib/jobs/job-intake-contract';
import { organizedJobs } from '@/lib/jobs/jobs-list';
import type { NativeJobListItem } from '@/lib/jobs/job-intake-types';

const jobGroups = [{ title: 'Active jobs', completed: false }, { title: 'Completed jobs', completed: true }];

function formattedUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function JobsList({ jobs, filter = '', salesperson = '' }: { jobs: NativeJobListItem[]; filter?: string; salesperson?: string }) {
  const [printRequest, setPrintRequest] = useState<SavedPrintRequest | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const filteredJobs = useMemo(() => organizedJobs(jobs, filter, salesperson), [jobs, filter, salesperson]);

  return (
    <section aria-label="Saved jobs" className="app-workspace-panel rounded-lg p-2">
      <div>
        {jobGroups.map(({ title, completed }) => <section aria-label={title} key={title}>
          <h2 className="border-b border-slate-300 px-1 py-2 text-sm font-semibold">{title}</h2>
          {filteredJobs.filter(job => (job.isComplete === true) === completed).map((job) => (
          <article className="grid min-h-10 gap-x-3 border-b border-slate-200 px-1 py-0.5 last:border-b-0 sm:grid-cols-[8rem_8rem_minmax(9rem,1fr)_minmax(10rem,1.3fr)_9rem_5rem_auto] sm:items-center" key={job.internalJobId}>
            <h3 className="truncate text-[13px] font-semibold">{visibleJobIdentifier(job)}</h3>
            <span className="w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100">{job.lifecycleStage}</span>
            <span className="truncate text-xs" title={job.customer ?? undefined}>{job.customer ?? 'Customer not entered'}</span>
            <span className="truncate text-xs text-slate-600" title={job.siteAddress ?? undefined}>{job.siteAddress ?? 'Site not entered'}</span>
            <span className="text-[11px] text-slate-500">{formattedUpdatedAt(job.updatedAt)}</span>
            <span className="text-[11px] text-slate-600">{job.activeLineCount} active{job.archivedLineCount ? ` · ${job.archivedLineCount} archived` : ''}</span>
            <div className="flex items-center justify-self-end gap-1"><Link className="app-button app-button-secondary min-h-8 px-2" href={`/jobs/${job.internalJobId}/edit`}>
              Open
            </Link><details className="job-list-more relative" open={openMenu === job.internalJobId}><summary aria-label={`More actions for ${visibleJobIdentifier(job)}`} className="app-button cursor-pointer" onClick={event => { event.preventDefault(); setOpenMenu(current => current === job.internalJobId ? null : job.internalJobId); }}>⋯</summary><div className="job-print-menu">{(['work-order', 'labels'] as const).map(kind => <button className="app-button" type="button" key={kind} onClick={() => setPrintRequest({ internalJobId: job.internalJobId, kind })}>{kind === 'labels' ? 'Print Labels' : 'Print Work Order'}</button>)}</div></details></div>
          </article>
          ))}
        </section>)}
        {!filteredJobs.length ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
            {jobs.length ? 'No jobs match this search or salesperson.' : 'No DoorGo jobs have been saved yet.'}
          </p>
        ) : null}
      </div>
      {printRequest ? <SavedJobPrint key={printRequest.internalJobId + printRequest.kind} request={printRequest} onClose={() => setPrintRequest(null)} onReady={() => setOpenMenu(null)}/> : null}
    </section>
  );
}
