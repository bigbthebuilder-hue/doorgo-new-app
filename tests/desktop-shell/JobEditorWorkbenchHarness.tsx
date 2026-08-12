import { JobHeaderForm } from '@/components/jobs/JobHeaderForm';
import { defaultDoorLine } from '@/lib/jobs/door-line-contract';

export function JobEditorWorkbenchHarness() {
  return <main className="app-shell-main"><JobHeaderForm canEdit defaultSalesperson="Barrett" initialDraft={{
    header: { customer: 'Fixture Customer', siteAddress: '123 Fixture Street', salesperson: 'Barrett', phone: '555-0100', email: 'fixture@example.test', lifecycleStage: 'Draft' },
    lines: [{ ...defaultDoorLine('Exterior'), lineId: 'fixture-line', lineIndex: 1, lineStatus: 'Active' }],
  }} initialJob={null} inAppShell/></main>;
}
