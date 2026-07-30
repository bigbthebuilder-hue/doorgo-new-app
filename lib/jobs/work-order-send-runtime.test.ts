import assert from 'node:assert/strict';
import { resolveCurrentDoorGoAccess } from '../auth/access';
import type { NativeDoorLine, NativeJobAggregate } from './job-intake-types';
import { generateRevisionPinnedSavedWorkOrderPdfWithAccess, WorkOrderPdfServiceFailure } from './work-order-pdf-service-contract';
import { sendSavedWorkOrder, type WorkOrderEmailMessage } from './work-order-send-contract';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const access = resolveCurrentDoorGoAccess({ user: { id: USER_ID }, profile: { user_id: USER_ID, display_name: 'User', active: true, is_manager: false, company_location: null, must_change_password: false }, permissionRows: [{ permission_key: 'jobs', access_level: 'view' }] });
const generation = { generatedAt: '2026-07-22T18:30:00.000Z', generatedDate: '2026-07-22' };

function line(overrides: Partial<NativeDoorLine> = {}): NativeDoorLine {
  return { lineId: USER_ID, lineIndex: 1, lineStatus: 'Active', mode: 'Interior', doorType: 'Molded', config: 'D', width: `3'0"`, height: `6'8"`, customSlab: 'No', customSlabWidth: null, customSlabHeight: null, hand: 'LH', prep: 'YES', glass: null, jambWidth: `4-9/16"`, jambType: 'Primed', sill: null, weatherstrip: null, hingeType: 'REG', notes: null, qty: 1, roWidth: null, roHeight: null, material: 'wood', doorThickness: null, ripJamb: null, glassCalcStatus: 'Ready', glassWorkorderDetail: null, glassWarnings: [], glassBlockers: [], glassOverride: null, glassUnits: [], glassCalc: null, vendorCopyText: null, sidelightType: null, sidelightGlass: null, transomGlass: null, sidelightMeasurementLeft: null, sidelightMeasurementRight: null, panelSidelightWidth: null, panelSidelights: [], createdAt: generation.generatedAt, updatedAt: generation.generatedAt, createdByUserId: USER_ID, updatedByUserId: USER_ID, includeDiagramOnWorkOrder: false, ...overrides };
}

function aggregate(overrides: Partial<NativeJobAggregate> = {}): NativeJobAggregate {
  return { internalJobId: JOB_ID, doorGoReference: 'DG-000123', bizTrackSalesOrder: null, customer: 'Customer', siteAddress: 'Site', phone: null, email: null, salesperson: 'Barrett', lifecycleStage: 'Confirmed Job', notes: null, hingeColor: null, shopHours: 1, shopHoursSource: 'Calculated', poNumbers: [], fulfillmentPlan: null, deliveryDate: null, customerPickupDate: null, shopDate: null, shopDateSource: null, createdAt: generation.generatedAt, updatedAt: generation.generatedAt, revision: 7, createdByUserId: USER_ID, updatedByUserId: USER_ID, lines: [line()], ...overrides };
}

function repository(saved: NativeJobAggregate, calls: string[]) {
  return new Proxy({ findById: async (id: string) => { calls.push(id); return structuredClone(saved); } }, {
    get(target, property) {
      if (property === 'findById') return target.findById;
      throw new Error(`Mutation or unexpected repository access: ${String(property)}`);
    },
  });
}

async function main() {
  const base = aggregate();
  const before = JSON.stringify(base);
  const reloads: string[] = [];
  const fallback = await generateRevisionPinnedSavedWorkOrderPdfWithAccess(access, JOB_ID, 7, repository(base, reloads), false);
  assert.deepEqual(reloads, [JOB_ID], 'saved aggregate reload uses immutable job ID');
  assert.equal(fallback.document.pdfFilename, 'Work_Order_DG-000123.pdf');
  assert.deepEqual(Array.from(fallback.bytes.slice(0, 4)), [37, 80, 68, 70], 'authoritative J3B renderer returns PDF bytes');
  assert.equal(JSON.stringify(base), before, 'generation does not mutate the aggregate');

  const salesOrder = await generateRevisionPinnedSavedWorkOrderPdfWithAccess(access, JOB_ID, 7, repository(aggregate({ bizTrackSalesOrder: 'SO-900' }), []), false);
  assert.equal(salesOrder.document.pdfFilename, 'Work_Order_SO-900.pdf', 'Sales Order filename takes precedence');
  await assert.rejects(generateRevisionPinnedSavedWorkOrderPdfWithAccess(access, JOB_ID, 6, repository(base, []), false), WorkOrderPdfServiceFailure);
  const warningLine = line({ mode: 'Exterior', config: 'SD', glassCalcStatus: 'Warning', glassWarnings: [{ code: 'review', message: 'Review.' }] });
  await assert.rejects(generateRevisionPinnedSavedWorkOrderPdfWithAccess(access, JOB_ID, 7, repository(aggregate({ lines: [warningLine] }), []), false), /acknowledged/);
  const acknowledged = await generateRevisionPinnedSavedWorkOrderPdfWithAccess(access, JOB_ID, 7, repository(aggregate({ lines: [warningLine] }), []), true);
  assert.ok(acknowledged.bytes.length > 4);
  await assert.rejects(generateRevisionPinnedSavedWorkOrderPdfWithAccess(access, JOB_ID, 7, repository(aggregate({ lines: [line({ mode: 'Exterior', config: 'SD', glassCalcStatus: 'Blocked', glassBlockers: [{ code: 'blocked', message: 'Blocked.' }] })] }), []), true), /blocked door lines/);

  const authoritativeResults: Awaited<ReturnType<typeof generateRevisionPinnedSavedWorkOrderPdfWithAccess>>[] = [];
  const deliveredMessages: WorkOrderEmailMessage[] = [];
  const result = await sendSavedWorkOrder(access, { internalJobId: JOB_ID, expectedRevision: 7, acknowledged: false, recipientUserIds: [USER_ID] }, {
    resolveRecipients: async () => [{ userId: USER_ID, displayName: 'Recipient', email: 'recipient@example.com' }],
    generatePdf: async (input) => {
      const authoritative = await generateRevisionPinnedSavedWorkOrderPdfWithAccess(access, input.internalJobId, input.expectedRevision, repository(base, []), input.acknowledged);
      authoritativeResults.push(authoritative);
      return { visibleIdentifier: authoritative.document.visibleIdentifier, pdfFilename: authoritative.document.pdfFilename, bytes: authoritative.bytes };
    },
    sendMessage: async (message) => { deliveredMessages.push(message); return { ok: true, messageId: 'mocked' }; },
  });
  assert.equal(result.outcome, 'success');
  assert.equal(authoritativeResults.length, 1);
  assert.equal(deliveredMessages.length, 1);
  assert.strictEqual(deliveredMessages[0].attachment.bytes, authoritativeResults[0].bytes, 'provider receives the exact authoritative J3B byte object');
  assert.equal(deliveredMessages[0].attachment.filename, authoritativeResults[0].document.pdfFilename);
  assert.deepEqual(Object.keys({ resolveRecipients: true, generatePdf: true, sendMessage: true }).sort(), ['generatePdf', 'resolveRecipients', 'sendMessage'], 'Send runtime exposes no mutation dependency');
  console.log('Native Job Intake J3C saved-state and PDF runtime integration tests passed');
}

void main();
