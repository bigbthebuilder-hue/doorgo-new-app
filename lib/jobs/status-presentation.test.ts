import assert from 'node:assert/strict';
import { statusLabel, hasVisibleStatus } from './status-presentation';
import { defaultDoorLine, normalizeDoorLineInput } from './door-line-contract';
import { calculateGlassGeometry } from './glass-geometry-contract';
import { createWorkOrderRowGroup, type WorkOrderDocument } from './work-order-document-contract';
import { assertWorkOrderPreflight, workOrderPreflightStatusLabel } from './work-order-preflight-contract';
import { measureWorkOrderGroup, WORK_ORDER_FONT_METRICS } from './work-order-layout';
import type { DoorLineInput, NativeDoorLine } from './job-intake-types';

assert.equal(statusLabel('Glass Detail Needed'), 'Details Needed');
assert.equal(statusLabel('Manual Override'), 'Geometry Exception Approved');
assert.equal(statusLabel('Unsupported'), 'Unsupported Configuration');
for (const value of ['Complete', 'Warning', 'Blocked', 'Not Applicable', 'Incomplete']) assert.equal(statusLabel(value), value);
assert.equal(hasVisibleStatus('Ready'), false);
assert.equal(hasVisibleStatus('Not Needed'), false);
const base = { ...defaultDoorLine('Exterior'), lineId: 'status', lineIndex: 1 };
const missing = { ...base, material: 'wood', customSlab: 'WoodCustom', customSlabWidth: '', customSlabHeight: '79' };
const missingRow = createWorkOrderRowGroup(missing as NativeDoorLine, null);
assert.equal(missingRow.primaryRow.status, 'Blocked');
assert.match(missingRow.primaryRow.cells.notesGlass, /BLOCKED: Custom slab width is required./);
assert.doesNotMatch(JSON.stringify(missingRow), /RO \/ GLASS NEEDS REVIEW|customSlabWidth|GLASS DETAIL NEEDED/);
const layout = measureWorkOrderGroup(missingRow.primaryRow, missingRow.detailRows, WORK_ORDER_FONT_METRICS);
assert.equal(layout.detailLayouts[0].label, 'BLOCKED: ');
// Exercise malformed runtime data without broadening the production construction type.
const invalid = normalizeDoorLineInput({ ...base, customSlab: 'invalid', construction: 'invalid' as unknown as DoorLineInput['construction'] });
assert.ok(!invalid.ok);
assert.equal(invalid.fieldErrors.customSlab, 'Choose Standard sizing, Custom Slab, or Fit to RO.');
assert.equal(invalid.fieldErrors.construction, 'Choose a Sill: STD, DARK, LOW-PRO, NONE, or J-4-S.');
const missingValidation = normalizeDoorLineInput(missing);
assert.ok(!missingValidation.ok);
assert.equal(missingValidation.fieldErrors.customSlabWidth, 'Custom slab width is required.');
const glass = { ...base, config: 'SD', roWidth: '60', sidelightType: 'Glass', sidelightGlass: 'Clear' } satisfies DoorLineInput;
const structured = calculateGlassGeometry({ ...glass, sidelightSpecifications: [{ side: 'left', index: 1, finishedWidth: '20', tBarSize: '2.25', glassTypeCode: null, customGlassDescription: null, panelSizeMode: null, panelConstructionNotes: null }] });
assert.equal(structured.status, 'Blocked');
assert.ok(structured.blockers.some(issue => issue.message === 'Choose a Glass Type for the sidelights.'));
for (const [line, status] of [[{ ...glass, roWidth: '' }, 'Glass Detail Needed'], [{ ...glass, roHeight: '84' }, 'Warning'], [missing, 'Blocked']] as const) {
  const row = createWorkOrderRowGroup(line as NativeDoorLine, null);
  assert.equal(row.primaryRow.status, status);
  const doc = { rowGroups: [row], validationIssues: [] } as unknown as WorkOrderDocument;
  if (status === 'Blocked') assert.throws(() => assertWorkOrderPreflight(doc, true), /blocked/);
  else {
    assert.throws(() => assertWorkOrderPreflight(doc, false), /acknowledged/);
    assert.doesNotThrow(() => assertWorkOrderPreflight(doc, true));
  }
  if (status === 'Glass Detail Needed') {
    assert.equal(workOrderPreflightStatusLabel(status), 'Details Needed');
    assert.match(row.primaryRow.cells.notesGlass, /DETAILS NEEDED/);
    assert.equal(measureWorkOrderGroup(row.primaryRow, row.detailRows, WORK_ORDER_FONT_METRICS).detailLayouts[0].label, 'DETAILS NEEDED: ');
  }
}
console.log('Status wording and unchanged preflight eligibility: PASS');
