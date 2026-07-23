import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveCurrentDoorGoAccess } from '../auth/access';
import { createLocalJobIntakeRepository } from './local-job-intake-repository';
import { JobIntakeFailure, type NativeDoorLine, type NativeJobAggregate } from './job-intake-types';
import { generateSavedWorkOrderWithAccess } from './work-order-generation-service-contract';
import { calculateGlassGeometry } from './glass-geometry-contract';
import {
  createWorkOrderPdfFilename, createWorkOrderRowGroup, formatWorkOrderPoNumbers,
  formatWorkOrderNotesGlass, generateWorkOrderDocument, paginateWorkOrder, type WorkOrderHeader, type WorkOrderRowGroup,
} from './work-order-document-contract';

function line(overrides: Partial<NativeDoorLine> = {}): NativeDoorLine {
  return {
    lineId: '11111111-1111-4111-8111-111111111111', lineIndex: 1, lineStatus: 'Active',
    mode: 'Interior', doorType: 'Molded', config: 'D', width: `3'0"`, height: `6'8"`, customSlab: 'No',
    customSlabWidth: null, customSlabHeight: null, hand: 'LH', prep: 'YES', glass: null,
    jambWidth: `4-9/16"`, jambType: 'Primed', sill: null, weatherstrip: null, hingeType: 'REG',
    notes: null, qty: 1, roWidth: null, roHeight: null, material: 'wood', doorThickness: null,
    ripJamb: null, glassCalcStatus: 'Ready', glassWorkorderDetail: null, glassWarnings: [], glassBlockers: [],
    glassOverride: null, glassUnits: [], glassCalc: null, vendorCopyText: null, sidelightType: null,
    sidelightGlass: null, transomGlass: null, sidelightMeasurementLeft: null, sidelightMeasurementRight: null,
    panelSidelightWidth: null, panelSidelights: [], createdAt: '2026-07-22T10:00:00.000Z',
    updatedAt: '2026-07-22T10:00:00.000Z', createdByUserId: 'user-1', updatedByUserId: 'user-1',
    ...overrides, includeDiagramOnWorkOrder: overrides.includeDiagramOnWorkOrder ?? false,
  };
}

function aggregate(overrides: Partial<NativeJobAggregate> = {}): NativeJobAggregate {
  return {
    internalJobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', doorGoReference: 'DG-000123',
    bizTrackSalesOrder: null, customer: 'Central Customer', siteAddress: '100 Main', phone: '555-1000',
    email: 'contact@example.com', salesperson: 'Barrett', lifecycleStage: 'Confirmed Job', notes: 'Job note',
    hingeColor: 'C15', shopHours: 4.5, shopHoursSource: 'Manual', poNumbers: ['1234502', '1234500', '1234501'],
    fulfillmentPlan: 'Delivery', deliveryDate: '2026-08-01', customerPickupDate: null, shopDate: '2026-07-28',
    shopDateSource: 'Manual', createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-22T10:00:00.000Z',
    revision: 7, createdByUserId: 'user-1', updatedByUserId: 'user-1', lines: [line()], ...overrides,
  };
}

const generation = { generatedAt: '2026-07-22T18:30:00.000Z', generatedDate: '2026-07-22' };

function activeAccess(level: 'none' | 'view' | 'use', manager = false) {
  return resolveCurrentDoorGoAccess({
    user: { id: `user-${level}` },
    profile: { user_id: `user-${level}`, display_name: 'User', active: true, is_manager: manager, company_location: null, must_change_password: false },
    permissionRows: [{ permission_key: 'jobs', access_level: level }],
  });
}

function pageHeader(): WorkOrderHeader {
  return { visibleIdentifier: 'DG-1', customer: 'Customer', siteAddress: '', phone: '', email: '', salesperson: '', shopHours: '', shopHoursSource: '', fulfillmentType: '', fulfillmentDate: '', notes: '', generatedDate: '2026-07-22', shopDate: '', poNumbers: [], poDisplay: '' };
}

function weighted(lineIndex: number, weightedUnits: number): WorkOrderRowGroup {
  const primary = createWorkOrderRowGroup(line({ lineId: `00000000-0000-4000-8000-${String(lineIndex).padStart(12, '0')}`, lineIndex }), null);
  return { ...primary, weightedUnits };
}

async function main() {
  const fallback = generateWorkOrderDocument(aggregate(), generation);
  assert.equal(fallback.visibleIdentifier, 'DG-000123');
  assert.equal(fallback.pdfFilename, 'Work_Order_DG-000123.pdf');
  assert.equal(fallback.internalCorrelation.sourceAggregateRevision, 7);
  assert.equal(fallback.generatedDate, '2026-07-22');
  assert.equal(fallback.header.customer, 'Central Customer');
  assert.equal(fallback.header.siteAddress, '100 Main');
  assert.equal(fallback.header.phone, '555-1000');
  assert.equal(fallback.header.email, 'contact@example.com');
  assert.equal(fallback.header.salesperson, 'Barrett');
  assert.equal(fallback.header.shopHours, '4.5');
  assert.equal(fallback.header.shopHoursSource, 'Manual');
  assert.equal(fallback.header.fulfillmentType, 'Delivery');
  assert.equal(fallback.header.fulfillmentDate, '2026-08-01');
  assert.equal(fallback.header.notes, 'Job note');
  assert.equal(fallback.header.shopDate, '2026-07-28');
  assert.equal(fallback.header.poDisplay, '1234500/01/02');
  assert.equal(fallback.pages[0]?.footerText, 'Sales Order / Job ID: DG-000123 | Page 1 of 1');

  const sales = generateWorkOrderDocument(aggregate({ bizTrackSalesOrder: 'SO-900' }), generation);
  assert.equal(sales.visibleIdentifier, 'SO-900');
  assert.equal(sales.pdfFilename, 'Work_Order_SO-900.pdf');
  assert.equal(JSON.stringify(sales.header).includes('DG-000123'), false, 'temporary reference is suppressed from visible output');
  assert.equal(createWorkOrderPdfFilename('../../SO:12\\bad'), 'Work_Order_SO_12_bad.pdf');
  assert.equal(createWorkOrderPdfFilename('SO-900').includes('aaaaaaaa'), false);
  assert.throws(() => createWorkOrderPdfFilename(' ../.. '));
  assert.throws(() => generateWorkOrderDocument(aggregate({ doorGoReference: '', bizTrackSalesOrder: null }), generation));
  assert.equal(sales.pdfFilename.includes('Central Customer'), false);
  assert.equal(sales.pdfFilename.includes('contact@example.com'), false);
  assert.equal(sales.pdfFilename.includes('7'), false);

  assert.deepEqual(formatWorkOrderPoNumbers(['', ' 1234502 ', '1234500', '1234501', '1234500']), { values: ['1234500', '1234501', '1234502'], display: '1234500/01/02' });
  assert.deepEqual(formatWorkOrderPoNumbers(['7']), { values: ['7'], display: '7' });
  assert.deepEqual(formatWorkOrderPoNumbers(['1000', '99', '101']), { values: ['99', '101', '1000'], display: '99/101/1000' });
  assert.throws(() => formatWorkOrderPoNumbers(['12A']));

  const orderedLines = [line({ lineId: 'a', lineIndex: 3 }), line({ lineId: 'b', lineIndex: 1 }), line({ lineId: 'c', lineIndex: 2, lineStatus: 'Archived' }), line({ lineId: 'd', lineIndex: 4, lineStatus: 'Merged' })];
  const ordered = generateWorkOrderDocument(aggregate({ lines: orderedLines }), generation);
  assert.deepEqual(ordered.rowGroups.map((group) => group.primaryRow.lineId), ['b', 'a']);

  const interiorD = createWorkOrderRowGroup(line(), 'C15');
  assert.equal(interiorD.primaryRow.cells.size, `3'0"`);
  assert.equal(createWorkOrderRowGroup(line({ width: `2'6"`, height: `6'8"` }), null).primaryRow.cells.size, `2'6"`);
  assert.equal(createWorkOrderRowGroup(line({ width: `3'6"`, height: `6'8"` }), null).primaryRow.cells.size, `3'6"`);
  assert.equal(createWorkOrderRowGroup(line({ height: `7'0"` }), null).primaryRow.cells.size, `3'0" × 7'0"`);
  assert.equal(createWorkOrderRowGroup(line({ height: `8'0"` }), null).primaryRow.cells.size, `3'0" × 8'0"`);
  assert.equal(createWorkOrderRowGroup(line({ height: `7'6"` }), null).primaryRow.cells.size, `3'0" × 7'6"`);
  assert.equal(createWorkOrderRowGroup(line({ customSlab: 'WoodCustom', customSlabWidth: `39"`, customSlabHeight: `92"` }), null).primaryRow.cells.size, `39" × 92"`);
  assert.equal(interiorD.primaryRow.cells.drill, 'Single drilled');
  assert.match(interiorD.detailRows.flatMap((row) => row.lines).join('\n'), /Jamb legs|Header/);
  const interiorDd = createWorkOrderRowGroup(line({ config: 'DD', prep: 'BOTH', hand: null }), null);
  assert.match(interiorDd.detailRows.flatMap((row) => row.lines).join('\n'), /72 1\/4"/);
  const pkt = createWorkOrderRowGroup(line({ config: 'PKT', prep: 'Round Weiser', hand: null, jambWidth: null, jambType: null, hingeType: null }), null);
  assert.equal(pkt.primaryRow.cells.drill, 'Round Weiser');
  assert.equal(pkt.primaryRow.cells.jamb, '');
  assert.equal(pkt.primaryRow.cells.hinge, '');
  assert.equal(pkt.primaryRow.cells.swing, '');
  assert.deepEqual(pkt.detailRows, []);
  const bp = createWorkOrderRowGroup(line({ config: 'B.P.', prep: 'NO', hand: null, jambWidth: null, jambType: null, hingeType: null, roHeight: null }), null);
  assert.match(bp.detailRows.flatMap((row) => row.lines).join('\n'), /F\.O\. Height: 82 3\/4"/);
  assert.equal(bp.detailRows.flatMap((row) => row.lines).join('\n').includes('F.O. Width'), false);
  assert.equal(bp.detailRows.flatMap((row) => row.lines).join('\n').includes('Door cut to'), false);
  const cutBp = createWorkOrderRowGroup(line({ config: 'B.P.', prep: 'NO', hand: null, jambWidth: null, jambType: null, hingeType: null, roHeight: `80"` }), null);
  assert.match(cutBp.detailRows.flatMap((row) => row.lines).join('\n'), /F\.O\. Height: 80" \| Door cut to: 77 1\/4"/);
  const exterior = createWorkOrderRowGroup(line({ mode: 'Exterior', material: 'fiberglass', hand: 'LH', prep: 'STD', sill: 'STD', weatherstrip: 'WHT', jambWidth: `6-9/16"`, hingeType: 'BB' }), 'C15');
  assert.match(exterior.detailRows.flatMap((row) => row.lines).join('\n'), /Header\/Sill: 36"/);
  assert.equal(exterior.primaryRow.cells.thickness, '1-3/4');
  const exteriorDd = createWorkOrderRowGroup(line({ mode: 'Exterior', config: 'DD', material: 'fiberglass', hand: 'LHOUT', prep: 'STD', sill: 'STD', weatherstrip: 'WHT', jambWidth: `6-9/16"`, hingeType: 'BB' }), 'C15');
  assert.match(exteriorDd.detailRows.flatMap((row) => row.lines).join('\n'), /72 9\/16"/);

  for (const config of ['SD', 'DS', 'SDS', 'SDDS', 'T/SD', 'T/DS', 'T/SDS', 'T/SDDS'] as const) {
    const glass = createWorkOrderRowGroup(line({ mode: 'Exterior', config, material: 'fiberglass', glassCalcStatus: 'Complete', roWidth: '96', roHeight: config.startsWith('T/') ? '100' : null, sidelightType: 'Glass', glassCalc: { jambLeg: `97 1/2"`, headerWidth: `94"`, divider: `2 1/4"`, transomWidth: config.startsWith('T/') ? `91 7/8"` : '' }, glassUnits: [{ position: config === 'DS' ? 'Right Sidelight' : 'Left Sidelight', width: `12"`, height: `80"`, glassType: 'Clear', termCode: 'CLR', qty: 1 }] }), null);
    assert.equal(glass.primaryRow.status, 'Complete');
    assert.match(glass.detailRows.flatMap((row) => row.lines).join('\n'), /Left Sidelight|Right Sidelight/);
    assert.equal(/divider/i.test(glass.detailRows.flatMap((row) => row.lines).join('\n')), false);
    assert.ok(glass.detailRows.length <= 3);
  }
  for (const config of ['T/D', 'T/DD'] as const) {
    const transom = createWorkOrderRowGroup(line({ mode: 'Exterior', config, material: 'fiberglass', glassCalcStatus: 'Complete', roWidth: '75', roHeight: '100', glassCalc: { transomWidth: `72 7/16"`, transomHeight: `15"`, headerWidth: `72 9/16"` }, glassUnits: [{ position: 'Transom', width: `72 7/16"`, height: `15"`, glassType: 'Clear', termCode: 'CLR', qty: 1 }] }), null);
    assert.match(transom.detailRows.flatMap((row) => row.lines).join('\n'), /Transom/);
  }
  const fiberglassPanel = createWorkOrderRowGroup(line({ mode: 'Exterior', config: 'SD', material: 'fiberglass', glassCalcStatus: 'Complete', sidelightType: 'Panel', glassCalc: { divider: `1 1/2"`, panelWidth: `11 3/4"` }, panelSidelights: [{ position: 'Left Panel', material: 'Fiberglass', width: `11 3/4"`, height: `79"`, qty: 1 }] }), null);
  assert.match(fiberglassPanel.detailRows.flatMap((row) => row.lines).join('\n'), /Fiberglass 11 3\/4" × 79"/);
  const woodPanel = createWorkOrderRowGroup(line({ mode: 'Exterior', config: 'DS', material: 'wood', glassCalcStatus: 'Complete', sidelightType: 'Panel', glassCalc: { divider: `1 1/2"`, panelWidth: `15 1/8"` }, panelSidelights: [{ position: 'Right Panel', material: 'Wood', width: `15.125`, height: `80`, qty: 1 }] }), null);
  assert.match(woodPanel.detailRows.flatMap((row) => row.lines).join('\n'), /Wood 15 1\/8" × 80"/);
  const repeatedGlass = createWorkOrderRowGroup(line({
    mode: 'Exterior', config: 'DSS', material: 'fiberglass', glassCalcStatus: 'Complete',
    roWidth: '96', sidelightType: 'Glass', includeDiagramOnWorkOrder: true,
    glassCalc: { headerWidth: `94"`, slabWidth: `35 3/4"`, finalDoorHeight: `79"`, divider: `2 1/4"`, sidelightWidth: `26 5/8"`, sidelightHeight: `79 1/8"`, sidelightType: 'Glass' },
    glassUnits: [
      { position: 'Right sidelight 1', width: `26 5/8"`, height: `79 1/8"`, glassType: 'Clear', termCode: 'CLR', qty: 1 },
      { position: 'Right sidelight 2', width: `26 5/8"`, height: `79 1/8"`, glassType: 'Clear', termCode: 'CLR', qty: 1 },
    ],
  }), null);
  assert.equal(repeatedGlass.primaryRow.cells.configuration, 'DSS');
  assert.match(repeatedGlass.detailRows.flatMap((row) => row.lines).join('\n'), /2 sidelights @ 26 5\/8" × 79 1\/8" Clear/);
  assert.doesNotMatch(repeatedGlass.detailRows.flatMap((row) => row.lines).join('\n'), /Right sidelight 2/);
  assert.equal(repeatedGlass.diagram?.parts.filter((part) => part.kind === 'glass').length, 2);
  const threeRepeated = createWorkOrderRowGroup(line({
    mode: 'Exterior', config: 'DSSS', material: 'fiberglass', glassCalcStatus: 'Complete',
    sidelightType: 'Glass', glassUnits: Array.from({ length: 3 }, (_, index) => ({
      position: `Right sidelight ${index + 1}`, width: `11 5/8"`, height: `79 1/8"`,
      glassType: 'Clear', termCode: 'CLR', qty: 1,
    })),
  }), null);
  assert.match(threeRepeated.detailRows.flatMap((row) => row.lines).join('\n'), /3 sidelights @ 11 5\/8" × 79 1\/8" Clear/);
  const correctedTallGeometry = calculateGlassGeometry({
    mode: 'Exterior', config: 'DSSS', width: `3'0"`, height: `8'0"`, material: 'fiberglass',
    customSlab: 'No', hand: 'LH', roWidth: '80', roHeight: '104',
    sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG',
  });
  const correctedTallWorkOrder = createWorkOrderRowGroup(line({
    mode: 'Exterior', config: 'DSSS', width: `3'0"`, height: `8'0"`, material: 'fiberglass',
    customSlab: 'No', hand: 'LH', roWidth: '80', roHeight: '104', sidelightType: 'Glass',
    glassCalcStatus: correctedTallGeometry.status, glassCalc: correctedTallGeometry.glassCalc,
    glassUnits: correctedTallGeometry.glassUnits, glassWarnings: correctedTallGeometry.warnings,
  }), null);
  assert.match(correctedTallWorkOrder.detailRows.flatMap((row) => row.lines).join('\n'), /Jamb legs: 97 1\/4"/, 'J3A detail consumes the corrected saved jamb-leg result');
  const fourRepeated = createWorkOrderRowGroup(line({
    mode: 'Exterior', config: 'SSDSS', material: 'fiberglass', glassCalcStatus: 'Complete',
    sidelightType: 'Glass', glassCalc: { headerWidth: `94"` },
    glassUnits: ['Left 1', 'Left 2', 'Right 1', 'Right 2'].map((position) => ({ position: `${position} sidelight`, width: `8 1/8"`, height: `79 1/8"`, glassType: 'Clear', termCode: 'CLR', qty: 1 })),
  }), null);
  assert.match(fourRepeated.detailRows.flatMap((row) => row.lines).join('\n'), /4 sidelights @ 8 1\/8" × 79 1\/8" Clear/);
  const mixedRepeated = createWorkOrderRowGroup(line({
    mode: 'Exterior', config: 'DSSS', material: 'fiberglass', glassCalcStatus: 'Complete',
    sidelightType: 'Glass', glassUnits: [
      { position: 'Right sidelight 1', width: `12"`, height: `79"`, glassType: 'Clear', termCode: 'CLR', qty: 1 },
      { position: 'Right sidelight 2', width: `12"`, height: `79"`, glassType: 'Clear', termCode: 'CLR', qty: 1 },
      { position: 'Right sidelight 3', width: `14"`, height: `79"`, glassType: 'Satin Etch', termCode: 'SAT', qty: 1 },
    ],
  }), null);
  const mixedText = mixedRepeated.detailRows.flatMap((row) => row.lines).join('\n');
  assert.match(mixedText, /2 sidelights @ 12" × 79" Clear/);
  assert.match(mixedText, /Right sidelight 3: 14" × 79" Satin Etch/);
  const groupedPanels = createWorkOrderRowGroup(line({
    mode: 'Exterior', config: 'SDS', material: 'fiberglass', glassCalcStatus: 'Complete',
    sidelightType: 'Panel', panelSidelights: [
      { position: 'Left Panel', material: 'Fiberglass', width: `11 3/4"`, height: `79"`, qty: 1 },
      { position: 'Right Panel', material: 'Fiberglass', width: `11 3/4"`, height: `79"`, qty: 1 },
    ],
  }), null);
  assert.match(groupedPanels.detailRows.flatMap((row) => row.lines).join('\n'), /2 sidelight panels @ Fiberglass 11 3\/4" × 79"/);

  assert.equal(formatWorkOrderNotesGlass('Glass'), '');
  assert.equal(formatWorkOrderNotesGlass('Glass | RO 75" × 99"'), 'RO 75" × 99"');
  assert.equal(formatWorkOrderNotesGlass('Glass | Verify exterior trim'), 'Verify exterior trim');
  assert.equal(formatWorkOrderNotesGlass('Glass · RO 75" × 99"'), 'RO 75" × 99"');
  assert.equal(formatWorkOrderNotesGlass('Glass - RO 75" × 99"'), 'RO 75" × 99"');
  for (const meaningfulNote of ['Match existing glass', 'Customer supplying glass', 'Glass colour confirmed']) {
    assert.equal(formatWorkOrderNotesGlass(meaningfulNote), meaningfulNote);
  }
  const cleanedGlass = createWorkOrderRowGroup(line({
    mode: 'Exterior', config: 'T/SD', material: 'fiberglass', notes: 'Verify exterior trim',
    glassCalcStatus: 'Complete', roWidth: '75', roHeight: '99', includeDiagramOnWorkOrder: false,
    glassCalc: { transomWidth: `72 7/16"`, transomHeight: `15 1/8"`, sidelightWidth: `14 5/8"`, sidelightHeight: `95 1/8"` },
    glassUnits: [
      { position: 'Transom', width: `72 7/16"`, height: `15 1/8"`, glassType: 'Clear', termCode: 'CLR', qty: 1 },
      { position: 'Left Sidelight', width: `14 5/8"`, height: `95 1/8"`, glassType: 'Satin Etch', termCode: 'SAT', qty: 1 },
    ],
  }), null);
  assert.equal(cleanedGlass.primaryRow.cells.notesGlass, 'Verify exterior trim | RO 75" × 99"');
  assert.match(cleanedGlass.detailRows.flatMap((row) => row.lines).join('\n'), /Transom: 72 7\/16" × 15 1\/8" Clear/);
  assert.match(cleanedGlass.detailRows.flatMap((row) => row.lines).join('\n'), /Left Sidelight: 14 5\/8" × 95 1\/8" Satin Etch/);
  assert.equal(cleanedGlass.diagram, null, 'cleaning is independent of the saved diagram preference');

  const needed = createWorkOrderRowGroup(line({ mode: 'Exterior', config: 'SD', glassCalcStatus: 'Glass Detail Needed', roWidth: '60', glassCalc: null }), null);
  assert.equal(needed.primaryRow.status, 'Glass Detail Needed');
  assert.ok(needed.detailRows.some((row) => row.kind === 'detail-needed'));
  const warning = createWorkOrderRowGroup(line({ mode: 'Exterior', config: 'SD', glassCalcStatus: 'Warning', glassWarnings: [{ code: 'warn', message: 'Review opening.' }], glassCalc: { headerWidth: `58"` } }), null);
  assert.equal(warning.primaryRow.status, 'Warning');
  assert.match(warning.detailRows.flatMap((row) => row.lines).join('\n'), /Review opening/);
  const blocked = createWorkOrderRowGroup(line({ mode: 'Exterior', config: 'SD', glassCalcStatus: 'Blocked', glassBlockers: [{ code: 'bad', message: 'Impossible geometry.' }], glassCalc: { headerWidth: `58"` } }), null);
  assert.equal(blocked.primaryRow.status, 'Blocked');
  const incompleteFrame = createWorkOrderRowGroup(line({ mode: 'Interior', config: 'D', width: '' }), null);
  assert.equal(incompleteFrame.primaryRow.status, 'Blocked');
  assert.equal(incompleteFrame.detailRows[0]?.kind, 'detail-needed');
  assert.equal(blocked.detailRows.flatMap((row) => row.lines).join('\n').includes('header Width'), false, 'blocked dimensions are not finalized');
  const override = createWorkOrderRowGroup(line({ mode: 'Exterior', config: 'SD', glassCalcStatus: 'Manual Override', glassCalc: { headerWidth: `58"` }, glassOverride: { approvedLineId: '11111111-1111-4111-8111-111111111111', calculatedValues: { headerWidth: `58"` }, acceptedValues: { headerWidth: `58 1/8"` }, reason: 'Site verified', appliedByUserId: 'user', appliedByDisplayName: 'User', appliedAt: '2026-07-22T12:00:00.000Z' } }), null);
  assert.equal(override.primaryRow.status, 'Manual Override');
  const overrideRow = override.detailRows.find((row) => row.kind === 'manual-override');
  assert.equal(overrideRow?.overrideReason, 'Site verified');
  assert.deepEqual(overrideRow?.acceptedValues, { headerWidth: `58 1/8"` });

  const oneDetailLine = createWorkOrderRowGroup(line({ mode: 'Exterior', config: 'SD', glassCalcStatus: 'Warning', glassWarnings: [{ code: 'one', message: 'One.' }], glassCalc: null }), null);
  assert.equal(oneDetailLine.weightedUnits, 3, 'one primary plus the minimum two-unit detail section');
  const sevenDetailLines = createWorkOrderRowGroup(line({ mode: 'Exterior', config: 'SD', glassCalcStatus: 'Blocked', glassBlockers: [
    { code: 'one', message: 'One.' }, { code: 'two', message: 'Two.' },
    { code: 'three', message: 'Three.' }, { code: 'four', message: 'Four.' },
    { code: 'five', message: 'Five.' }, { code: 'six', message: 'Six.' },
    { code: 'seven', message: 'Seven.' },
  ], glassCalc: null }), null);
  assert.equal(sevenDetailLines.weightedUnits, 3, 'compact blocker text occupies one attached detail line');

  assert.equal(paginateWorkOrder([weighted(1, 21)], pageHeader()).length, 1, 'below first-page capacity');
  assert.equal(paginateWorkOrder([weighted(1, 22)], pageHeader()).length, 1, 'exact first-page capacity');
  const over = paginateWorkOrder([weighted(1, 20), weighted(2, 3)], pageHeader());
  assert.equal(over.length, 2);
  assert.equal(over[1]?.kind, 'Continuation');
  assert.equal(over[1]?.continuationHeader?.label, 'Continued');
  const continuation = paginateWorkOrder([weighted(1, 22), weighted(2, 26), weighted(3, 26), weighted(4, 1)], pageHeader());
  assert.deepEqual(continuation.map((page) => page.weightedUnitsUsed), [22, 26, 26, 1]);
  assert.equal(continuation[3]?.footerText, 'Sales Order / Job ID: DG-1 | Page 4 of 4');
  assert.deepEqual(continuation.flatMap((page) => page.rowGroups.map((group) => group.primaryRow.lineIndex)), [1, 2, 3, 4]);
  const oversized = paginateWorkOrder([weighted(1, 30), weighted(2, 1)], pageHeader());
  assert.deepEqual(oversized.map((page) => page.weightedUnitsUsed), [30, 1], 'oversized group stays intact on its own page');
  assert.deepEqual(paginateWorkOrder([], pageHeader()).map((page) => page.rowGroups.length), [0], 'empty model has one non-trailing page');

  const repository = { findById: async () => aggregate() };
  assert.equal((await generateSavedWorkOrderWithAccess(activeAccess('view'), 'id', generation, repository)).internalCorrelation.sourceAggregateRevision, 7);
  assert.equal((await generateSavedWorkOrderWithAccess(activeAccess('use'), 'id', generation, repository)).internalCorrelation.sourceAggregateRevision, 7);
  await assert.rejects(generateSavedWorkOrderWithAccess(activeAccess('none'), 'id', generation, repository), (error) => error instanceof JobIntakeFailure && error.code === 'permission_required');
  await assert.rejects(generateSavedWorkOrderWithAccess(activeAccess('none', true), 'id', generation, repository), (error) => error instanceof JobIntakeFailure && error.code === 'permission_required');

  const directory = await mkdtemp(path.join(os.tmpdir(), 'doorgo-j3a-'));
  const filePath = path.join(directory, 'store.json');
  const local = createLocalJobIntakeRepository({ filePath, enabled: true, runtime: 'test', uuid: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now: () => new Date('2026-07-22T12:00:00.000Z') });
  try {
    const saved = await local.create({ commandId: 'j3a', actorUserId: 'user-1', defaultSalesperson: null, input: { customer: 'Saved', poNumbers: ['1234500', '1234501'] }, lines: [line({ lineId: '' })] });
    const before = await readFile(filePath, 'utf8');
    const model = await generateSavedWorkOrderWithAccess(activeAccess('view'), saved.internalJobId, generation, local);
    assert.equal(await readFile(filePath, 'utf8'), before, 'generation does not change repository bytes');
    assert.equal(model.internalCorrelation.sourceAggregateRevision, saved.revision);
    assert.equal(model.internalCorrelation.internalJobId, saved.internalJobId);
    const reopened = await local.findById(saved.internalJobId);
    assert.equal(reopened?.revision, saved.revision);
    assert.equal(reopened?.lifecycleStage, saved.lifecycleStage);
    assert.equal(reopened?.lines[0]?.lineId, saved.lines[0]?.lineId);
    assert.equal(reopened?.updatedAt, saved.updatedAt);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  assert.deepEqual(generateWorkOrderDocument(aggregate(), generation), generateWorkOrderDocument(aggregate(), generation), 'generation is deterministic');
  console.log('Native Job Intake J3A work-order document model: PASS');
}

void main();
