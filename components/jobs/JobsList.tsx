'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { visibleJobIdentifier } from '@/lib/jobs/job-intake-contract';
import type { NativeJobAggregate } from '@/lib/jobs/job-intake-types';

function formattedUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function JobsList({ jobs }: { jobs: NativeJobAggregate[] }) {
  const [filter, setFilter] = useState('');
  const normalizedFilter = filter.trim().toLocaleLowerCase();
  const filteredJobs = useMemo(
    () => jobs.filter((job) => [
      visibleJobIdentifier(job),
      job.customer,
      job.siteAddress,
      job.salesperson,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedFilter))),
    [jobs, normalizedFilter],
  );

  return (
    <section aria-labelledby="saved-jobs-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="saved-jobs-heading" className="text-xl font-semibold">Saved draft jobs</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Local J1 drafts only</p>
        </div>
        <label className="grid w-full max-w-md gap-1 text-sm font-semibold" htmlFor="job-filter">
          Filter jobs
          <input
            className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-600 dark:bg-slate-950"
            id="job-filter"
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Identifier, customer, site or salesperson"
            type="search"
            value={filter}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-3">
        {filteredJobs.map((job) => (
          <article className="grid gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={job.internalJobId}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-lg font-semibold">{visibleJobIdentifier(job)}</h3>
                <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100">{job.lifecycleStage}</span>
              </div>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div><dt className="inline text-slate-500 dark:text-slate-400">Customer: </dt><dd className="inline">{job.customer ?? 'Not entered'}</dd></div>
                <div><dt className="inline text-slate-500 dark:text-slate-400">Site: </dt><dd className="inline">{job.siteAddress ?? 'Not entered'}</dd></div>
                <div><dt className="inline text-slate-500 dark:text-slate-400">Salesperson: </dt><dd className="inline">{job.salesperson ?? 'Not assigned'}</dd></div>
                <div><dt className="inline text-slate-500 dark:text-slate-400">Active lines: </dt><dd className="inline">{job.lines.filter((line) => line.lineStatus === 'Active').length}</dd></div>
                <div><dt className="inline text-slate-500 dark:text-slate-400">Shop Hours: </dt><dd className="inline">{job.shopHours ?? 'Not estimated'}</dd></div>
                <div><dt className="inline text-slate-500 dark:text-slate-400">Updated: </dt><dd className="inline">{formattedUpdatedAt(job.updatedAt)}</dd></div>
              </dl>
            </div>
            <Link className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-5 font-semibold dark:border-slate-600" href={`/jobs/${job.internalJobId}/edit`}>
              Open
            </Link>
          </article>
        ))}
        {!filteredJobs.length ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
            {jobs.length ? 'No drafts match this filter.' : 'No local draft jobs have been saved yet.'}
          </p>
        ) : null}
      </div>
    </section>
  );
}
