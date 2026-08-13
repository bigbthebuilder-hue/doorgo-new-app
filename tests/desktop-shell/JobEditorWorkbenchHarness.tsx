import { JobHeaderForm } from '@/components/jobs/JobHeaderForm';
import { defaultDoorLine } from '@/lib/jobs/door-line-contract';

export function JobEditorWorkbenchHarness() {
  return <div className="app-shell"><aside className="app-shell-sidebar"><span>DoorGo</span></aside><main className="app-shell-main"><JobHeaderForm canEdit defaultSalesperson="Barrett" initialDraft={{
    header: { bizTrackSalesOrder: 'DG-000123', customer: 'Fixture Customer', siteAddress: '123 Fixture Street', salesperson: 'Barrett', phone: '555-0100', email: 'fixture@example.test', lifecycleStage: 'Draft' },
    lines: [{ ...defaultDoorLine('Exterior'), lineId: 'fixture-line', lineIndex: 1, lineStatus: 'Active' }],
  }} initialJob={null} inAppShell/></main></div>;
}

export function EffectiveShopHoursHarness() {
  return <JobHeaderForm canEdit defaultSalesperson="Barrett" initialDraft={{
    header: { customer: 'Hours Fixture', salesperson: 'Barrett', lifecycleStage: 'Draft' },
    lines: [
      { ...defaultDoorLine('Exterior'), lineId: 'hours-d', lineIndex: 1, lineStatus: 'Active', config: 'D' },
      { ...defaultDoorLine('Exterior'), lineId: 'hours-dd', lineIndex: 2, lineStatus: 'Active', config: 'DD' },
      { ...defaultDoorLine('Exterior'), lineId: 'hours-tds', lineIndex: 3, lineStatus: 'Active', config: 'T/DS' },
    ],
  }} initialJob={null}/>;
}
