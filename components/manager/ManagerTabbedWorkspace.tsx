'use client';

import { useState } from 'react';
import type { ManagerCapacityConfiguration } from '@/lib/manager/capacity-configuration';
import type { ManagerCapacityExceptions } from '@/lib/manager/capacity-exceptions';
import { ManagerCapacityWorkspace } from './ManagerCapacityWorkspace';
import { ManagerCapacityExceptionsWorkspace } from './ManagerCapacityExceptionsWorkspace';

const MANAGER_TABS = [
  { id: 'staff', label: 'Staff & Capacity' },
  { id: 'working-days', label: 'Working Days' },
  { id: 'exceptions', label: 'Closures & Special Days' },
  { id: 'holidays', label: 'Stat Holidays' },
  { id: 'overrides', label: 'Capacity Overrides' },
] as const;

export type ManagerTab = (typeof MANAGER_TABS)[number]['id'];

export function ManagerTabbedWorkspace({ canEdit, configuration, exceptions }: {
  canEdit: boolean;
  configuration: ManagerCapacityConfiguration;
  exceptions: ManagerCapacityExceptions;
}) {
  const [activeTab, setActiveTab] = useState<ManagerTab>('staff');
  return <div className="app-workspace app-workspace-region manager-tabbed-workspace" data-active-tab={activeTab}>
    <header className="manager-workspace-header">
      <div><h1>Manager</h1><p>Capacity configuration · {configuration.companyLocation}</p></div>
      <nav aria-label="Manager sections" className="manager-tabs">
        {MANAGER_TABS.map(tab => <button aria-pressed={activeTab === tab.id} className="manager-tab" key={tab.id} onClick={() => setActiveTab(tab.id)} type="button">{tab.label}</button>)}
      </nav>
    </header>
    <ManagerCapacityWorkspace canEdit={canEdit} configuration={configuration}/>
    <ManagerCapacityExceptionsWorkspace canEdit={canEdit} data={exceptions} roster={configuration.staff}/>
  </div>;
}
