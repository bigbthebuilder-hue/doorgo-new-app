import { AppShell } from '../../components/app-shell/AppShell';
import { JobHeaderForm } from '../../components/jobs/JobHeaderForm';
import { defaultDoorLine } from '../../lib/jobs/door-line-contract';
import type { NativeDoorLine, NativeJobAggregate } from '../../lib/jobs/job-intake-types';

export function mobileIntakeJob(): NativeJobAggregate {
  const lines = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'].map((lineId, index) => ({
    ...defaultDoorLine('Exterior'), lineId, lineIndex: index + 1, lineStatus: 'Active', doorId: index ? 'B' : 'A',
    doorType: '3070SG10LE', height: `7'0"`, prep: 'STD', prepSource: 'manual', qty: index ? 1 : 2,
    individualDoorIds: index ? [] : ['A-1', 'A-2', 'Retained'],
  } as NativeDoorLine));
  return { internalJobId: '33333333-3333-4333-8333-333333333333', doorGoReference: 'DG-000123', visibleIdentifier: '1962955', bizTrackSalesOrder: '1962955',
    customer: 'Standing Bear', siteAddress: 'Building F', salesperson: 'Fixture', lifecycleStage: 'Draft', revision: 1, lines,
    phone: null, email: null, notes: null, hingeColor: null, shopHours: null, shopHoursSource: null, fulfillmentPlan: null, deliveryDate: null, customerPickupDate: null, shopDate: null, shopDateSource: null,
    poNumbers: [], createdByUserId: 'fixture', updatedByUserId: 'fixture', createdAt: '2026-11-19T00:00:00Z', updatedAt: '2026-11-19T00:00:00Z', origin: 'native',
  } as NativeJobAggregate;
}
export function MobileJobIntakeHarness({ job, canEdit = true }: { job: NativeJobAggregate | null; canEdit?: boolean }) {
  return <AppShell hasBottomBar hasTopBar navigation={[]} scrollOwner="workspace"><JobHeaderForm initialJob={job} initialDraft={job ? undefined : { header: { customer: 'Standing Bear' }, lines: [] }} canEdit={canEdit} defaultSalesperson="Fixture" inAppShell/></AppShell>;
}
