'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AppNavigationItem } from '@/lib/app-shell/navigation';
import type { NativeJobListItem } from '@/lib/jobs/job-intake-types';
import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { JobsList } from './JobsList';

export function JobsWorkspace({ jobs, navigation, canCreate }: {
  jobs: NativeJobListItem[];
  navigation: AppNavigationItem[];
  canCreate: boolean;
}) {
  const [filter, setFilter] = useState('');
  return <AppShell
    navigation={navigation}
    topBar={<ContextTopBar
      density="compact"
      title="Jobs"
      controls={<label className="app-jobs-filter" htmlFor="job-filter"><span>Filter jobs</span><input className="app-compact-input" id="job-filter" onChange={(event) => setFilter(event.target.value)} placeholder="Identifier, customer or site" type="search" value={filter}/></label>}
      actions={canCreate ? <><Link className="app-button app-button-secondary" href="/jobs/import">Import Legacy Job</Link><Link className="app-button app-button-primary" href="/jobs/new">New Job</Link></> : null}
    />}
  >
    <div className="app-workspace app-workspace-fluid"><JobsList filter={filter} jobs={jobs}/></div>
  </AppShell>;
}
