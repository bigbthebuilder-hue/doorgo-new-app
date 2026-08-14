import { JobHeaderForm } from '@/components/jobs/JobHeaderForm';
import { defaultDoorLine } from '@/lib/jobs/door-line-contract';
import type { NativeJobAggregate } from '@/lib/jobs/job-intake-types';

export function JobEditorWorkbenchHarness({ saved = false }: { saved?: boolean }) {
  const line = { ...defaultDoorLine('Exterior'), lineId: 'fixture-line', lineIndex: 1, lineStatus: 'Active' as const };
  const savedJob = saved ? {
    internalJobId: '11111111-1111-4111-8111-111111111111', doorGoReference: 'DG-000123', bizTrackSalesOrder: 'DG-000123',
    customer: 'Fixture Customer', siteAddress: '123 Fixture Street', salesperson: 'Barrett', phone: '555-0100', email: 'fixture@example.test',
    lifecycleStage: 'Draft', notes: 'Saved fixture notes', hingeColor: 'C15', shopHours: null, shopHoursSource: null, poNumbers: ['100', '200'], fulfillmentPlan: null,
    deliveryDate: null, customerPickupDate: null, shopDate: null, shopDateSource: null, createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z', revision: 1, createdByUserId: 'user', updatedByUserId: 'user', origin: 'native', lines: [line],
  } as unknown as NativeJobAggregate : null;
  return <div className="app-shell"><aside className="app-shell-sidebar"><span>DoorGo</span></aside><main className="app-shell-main"><JobHeaderForm canEdit defaultSalesperson="Barrett" initialDraft={{
    header: { bizTrackSalesOrder: 'DG-000123', customer: 'Fixture Customer', siteAddress: '123 Fixture Street', salesperson: 'Barrett', phone: '555-0100', email: 'fixture@example.test' },
    lines: [line],
  }} initialJob={savedJob} inAppShell/></main></div>;
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
