import { defaultDoorLine } from '../../lib/jobs/door-line-contract';
import type { NativeJobAggregate } from '../../lib/jobs/job-intake-types';
import type { SavedJobPrintKind } from '../../lib/jobs/saved-job-print-contract';
export async function loadSavedJobPrintAction(internalJobId: string, kind: SavedJobPrintKind) {
  if (document.documentElement.hasAttribute('data-fail-print')) return { ok: false as const, message: 'Fixture saved-document load failed.' };
  const job = { internalJobId, doorGoReference: 'DG-000001', visibleIdentifier: 'DG-000001', customer: 'Fresh saved customer', bizTrackSalesOrder: '12345', revision: 9, updatedAt: '2026-11-23T00:00:00Z', poNumbers: [], lifecycleStage: 'Draft', lines: [{ ...defaultDoorLine(), lineId: 'line-1', lineIndex: 1, lineStatus: 'Active', doorId: 'Fresh saved Door ID', productCode: 'FRAME-1', qty: 1 }, { ...defaultDoorLine(), lineId: 'line-2', lineIndex: 2, lineStatus: 'Active', doorId: 'Second saved Door ID', qty: 2 }] } as unknown as NativeJobAggregate;
  const context = kind === 'labels' ? { kind: 'labels' as const, job } : { kind: 'work-order' as const, internalJobId, sourceRevision: 9, visibleIdentifier: '12345', pdfFilename: '12345.pdf', preflight: { issues: [], blocked: false, acknowledgementRequired: false } };
  return { ok: true as const, context, recipients: [], recipientDirectoryError: null, canViewCalendar: true };
}
export async function sendWorkOrderAction() { return { ok: false as const, message: 'Sending is not used by printing fixtures.' }; }
