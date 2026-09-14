'use client';

import { useState } from 'react';
import type { ManagerCapacityConfiguration } from '@/lib/manager/capacity-configuration';
import type { ManagerCapacityExceptions } from '@/lib/manager/capacity-exceptions';
import { ManagerCapacityWorkspace } from './ManagerCapacityWorkspace';
import { ManagerCapacityExceptionsWorkspace } from './ManagerCapacityExceptionsWorkspace';
import { UsersAccessWorkspace } from './UsersAccessWorkspace';
import type { ComponentProps } from 'react';

const MANAGER_TABS = [
  { id: 'staff', label: 'Staff & Capacity' },
  { id: 'working-days', label: 'Working Days' },
  { id: 'exceptions', label: 'Closures & Special Days' },
  { id: 'holidays', label: 'Stat Holidays' },
  { id: 'overrides', label: 'Capacity Overrides' },
] as const;

export type ManagerTab = (typeof MANAGER_TABS)[number]['id'] | 'users';

export function ManagerTabbedWorkspace({ canEdit, configuration, exceptions, usersAccess }: {
  canEdit: boolean;
  configuration: ManagerCapacityConfiguration | null;
  exceptions: ManagerCapacityExceptions | null;
  usersAccess?: ComponentProps<typeof UsersAccessWorkspace>;
}) {
  const [activeTab, setActiveTab] = useState<ManagerTab>(usersAccess ? 'users' : 'staff');
  return <div className="app-workspace app-workspace-region manager-tabbed-workspace" data-active-tab={activeTab}>
    <header className="manager-workspace-header">
      <div><h1>Admin</h1><p>Company administration{configuration ? ` · ${configuration.companyLocation}` : ''}</p></div>
      <nav aria-label="Admin sections" className="manager-tabs">
        {usersAccess && <button aria-pressed={activeTab === 'users'} className="manager-tab" onClick={() => setActiveTab('users')} type="button">Users &amp; Access</button>}
        {configuration && MANAGER_TABS.map(tab => <button aria-pressed={activeTab === tab.id} className="manager-tab" key={tab.id} onClick={() => setActiveTab(tab.id)} type="button">{tab.label}</button>)}
      </nav>
    </header>
    {usersAccess && activeTab === 'users' && <UsersAccessWorkspace {...usersAccess}/>}
    {configuration && <ManagerCapacityWorkspace canEdit={canEdit} configuration={configuration}/>}
    {configuration && exceptions && <ManagerCapacityExceptionsWorkspace canEdit={canEdit} data={exceptions} roster={configuration.staff} workweeks={configuration.workweeks}/>}
  </div>;
}
