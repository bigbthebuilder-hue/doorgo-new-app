'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { visibleJobIdentifier } from '@/lib/jobs/job-intake-contract';
import type { NativeJobListItem } from '@/lib/jobs/job-intake-types';

function formattedUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function JobsList({ jobs, filter = '' }: { jobs: NativeJobListItem[]; filter?: string }) {
  const normalizedFilter = filter.trim().toLocaleLowerCase();
  const filteredJobs = useMemo(
    () => jobs.filter((job) => [
      visibleJobIdentifier(job),
      job.customer,
      job.siteAddress,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedFilter))),
    [jobs, normalizedFilter],
  );

  return (
    <section aria-label="Saved jobs" className="app-workspace-panel rounded-lg p-2">
      <div>
        {filteredJobs.map((job) => (
          <article className="grid min-h-10 gap-x-3 border-b border-slate-200 px-1 py-0.5 last:border-b-0 sm:grid-cols-[8rem_8rem_minmax(9rem,1fr)_minmax(10rem,1.3fr)_9rem_5rem_auto] sm:items-center" key={job.internalJobId}>
            <h3 className="truncate text-[13px] font-semibold">{visibleJobIdentifier(job)}</h3>
            <span className="w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100">{job.lifecycleStage}</span>
            <span className="truncate text-xs" title={job.customer ?? undefined}>{job.customer ?? 'Customer not entered'}</span>
            <span className="truncate text-xs text-slate-600" title={job.siteAddress ?? undefined}>{job.siteAddress ?? 'Site not entered'}</span>
            <span className="text-[11px] text-slate-500">{formattedUpdatedAt(job.updatedAt)}</span>
            <span className="text-[11px] text-slate-600">{job.activeLineCount} active{job.archivedLineCount ? ` · ${job.archivedLineCount} archived` : ''}</span>
            <Link className="app-button app-button-secondary min-h-8 px-2" href={`/jobs/${job.internalJobId}/edit`}>
              Open
            </Link>
          </article>
        ))}
        {!filteredJobs.length ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
            {jobs.length ? 'No jobs match this filter.' : 'No DoorGo jobs have been saved yet.'}
          </p>
        ) : null}
      </div>
    </section>
  );
}
