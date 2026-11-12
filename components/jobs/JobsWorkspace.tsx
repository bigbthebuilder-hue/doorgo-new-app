'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AppNavigationItem } from '@/lib/app-shell/navigation';
import type { NativeJobListItem } from '@/lib/jobs/job-intake-types';
import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { defaultJobSalesperson, jobSalespeople, salespersonKey } from '@/lib/jobs/jobs-list';
import { JobsList } from './JobsList';

export function JobsWorkspace({ jobs, navigation, canCreate, currentSalesperson = '' }: {
  jobs: NativeJobListItem[];
  navigation: AppNavigationItem[];
  canCreate: boolean;
  currentSalesperson?: string;
}) {
  const [filter, setFilter] = useState('');
  const [salesperson, setSalesperson] = useState(() => salespersonKey(defaultJobSalesperson(jobs, currentSalesperson)));
  const salespeople = jobSalespeople(jobs);
  return <AppShell
    navigation={navigation}
    topBar={<ContextTopBar
      density="compact"
      title="Jobs"
      controls={<><label className="app-jobs-filter" htmlFor="job-filter"><span>Filter jobs</span><input className="app-compact-input" id="job-filter" onChange={(event) => setFilter(event.target.value)} placeholder="Identifier, customer or site" type="search" value={filter}/></label>
        <label className="app-jobs-salesperson" htmlFor="job-salesperson"><span>Salesperson</span>
          <select className="app-compact-input" id="job-salesperson" onChange={event => setSalesperson(event.target.value)} value={salesperson}>
            <option value="">All Salespeople</option>
            {salespeople.map(name => <option key={salespersonKey(name)} value={salespersonKey(name)}>{name}</option>)}
          </select>
        </label></>}
      actions={canCreate ? <><Link className="app-button app-button-secondary" href="/jobs/import">Import Legacy Job</Link><Link className="app-button app-button-primary" href="/jobs/new">New Job</Link></> : null}
    />}
  >
    <div className="app-workspace app-workspace-fluid"><JobsList filter={filter} jobs={jobs} salesperson={salesperson}/></div>
  </AppShell>;
}
