import assert from 'node:assert/strict';
import { calculateJ2AShopHours, defaultDoorLine, doorLineEquivalenceKey, normalizeDoorLineInput } from './door-line-contract';
import {
  GLASS_CONFIGS,
  applyManualGeometryOverride,
  calculateGlassGeometry,
  geometryChanged,
  glassConfigurationTopology,
  glassLineNeedsAttention,
  isGlassLineProductionReady,
  normalizeSidelightType,
  retainCompatibleGlassFields,
} from './glass-geometry-contract';
import type { DoorLineInput, GlassGeometryValues } from './job-intake-types';
import { reconcileGlassDimensionCommit } from './glass-dimension-reconciliation-contract';

function line(overrides: DoorLineInput = {}): DoorLineInput {
  return {
    ...defaultDoorLine('Exterior'), config: 'SD', width: `3'0"`, height: `6'8"`, material: 'fiberglass',
    roWidth: '60', roHeight: '', sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG',
    transomGlass: 'SAT_SB60_K4SG', ...overrides,
  };
}

const expected = {
  SD: { roWidth: '60', headerWidth: `58"`, sidelightWidth: `19 5/8"` },
  DS: { roWidth: '60', headerWidth: `58"`, sidelightWidth: `19 5/8"` },
  SDS: { roWidth: '78', headerWidth: `76"`, sidelightWidth: `17 5/8"` },
  SDDS: { roWidth: '96', headerWidth: `94"`, sidelightWidth: `8 3/8"` },
  'T/D': { roWidth: '38', headerWidth: `36"`, transomWidth: `35 7/8"` },
  'T/DD': { roWidth: '75', headerWidth: `72 9/16"`, transomWidth: `72 7/16"` },
  'T/SD': { roWidth: '60', headerWidth: `58"`, sidelightWidth: `19 5/8"` },
  'T/DS': { roWidth: '60', headerWidth: `58"`, sidelightWidth: `19 5/8"` },
  'T/SDS': { roWidth: '78', headerWidth: `76"`, sidelightWidth: `17 5/8"` },
  'T/SDDS': { roWidth: '96', headerWidth: `94"`, sidelightWidth: `8 3/8"` },
} as const;

for (const config of GLASS_CONFIGS) {
  const topology = glassConfigurationTopology(config);
  const transom = topology.hasTransom;
  const result = calculateGlassGeometry(line({ config, roWidth: expected[config].roWidth, roHeight: transom ? '96' : '' }));
  assert.equal(result.status, 'Complete', `${config} calculates completely`);
  assert.equal(result.glassCalc?.headerWidth, expected[config].headerWidth, `${config} header formula`);
  if (transom) assert.equal(result.glassCalc?.jambLeg, `95 1/2"`, `${config} jamb legs use the full transom-unit RO height`);
  if ('sidelightWidth' in expected[config]) assert.equal(result.glassCalc?.sidelightWidth, expected[config].sidelightWidth, `${config} sidelight formula`);
  if ('transomWidth' in expected[config]) assert.equal(result.glassCalc?.transomWidth, expected[config].transomWidth, `${config} transom formula`);
  assert.equal(result.vendorCopyText.length > 0, true, `${config} vendor output`);
  assert.equal(/\d'/.test(result.workorderDetail), false, `${config} work order uses inches-only geometry`);
  assert.equal(/\d'/.test(result.vendorCopyText), false, `${config} vendor copy uses inches-only geometry`);
}

const acceptedTransfer = calculateGlassGeometry(line({
  config: 'T/DS', hand: 'RHOUT', roWidth: '54', roHeight: '98',
  sidelightGlass: 'CLR_SB60_K4SG', transomGlass: 'CLR_SB60_K4SG',
}));
assert.equal(acceptedTransfer.status, 'Complete');
assert.equal(acceptedTransfer.glassCalc?.jambLeg, `97 1/2"`);
assert.equal(acceptedTransfer.glassCalc?.headerWidth, `52"`);
assert.deepEqual(acceptedTransfer.glassUnits.map(({ position, width, height }) => ({ position, width, height })), [
  { position: 'Right sidelight 1', width: `13 5/8"`, height: `79 1/8"` },
  { position: 'Transom', width: `51 7/8"`, height: `14 1/8"` },
]);
assert.match(acceptedTransfer.workorderDetail, /Jamb legs: 97 1\/2"/);
assert.doesNotMatch(JSON.stringify(acceptedTransfer), /NaN|Infinity|"-\d/);

assert.equal(line().width, `3'0"`, 'nominal door width remains feet/inches');
assert.equal(line().height, `6'8"`, 'nominal door height remains feet/inches');
assert.equal(calculateGlassGeometry(line({ roWidth: `5'0"` })).glassCalc?.roWidth, `60"`, 'legacy persisted feet/inch geometry loads as inches');

assert.deepEqual(glassConfigurationTopology('SD').sidelightPositions, ['left']);
assert.deepEqual(glassConfigurationTopology('DS').sidelightPositions, ['right']);
assert.equal(glassConfigurationTopology('T/SDDS').doorCount, 2);
assert.equal(normalizeSidelightType('Glass'), 'Glass');
assert.equal(normalizeSidelightType('Panel'), 'Panel');
assert.equal(normalizeSidelightType('mixed'), null, 'mixed sidelight state is rejected');
assert.equal(normalizeDoorLineInput(line({ sidelightType: 'mixed' as never })).ok, false, 'malformed mixed state is rejected at save validation');

const panel = calculateGlassGeometry(line({ sidelightType: 'Panel', panelSidelightWidth: '11 3/4', sidelightGlass: null }));
assert.equal(panel.status, 'Complete');
assert.equal(panel.panelSidelights[0].qty, 1);
assert.match(panel.workorderDetail, /PANELS/);
for (const width of ['11 3/4', '11-3/4', '11.75', '13 3/4', '13.75']) {
  const result = calculateGlassGeometry(line({ sidelightType: 'Panel', panelSidelightWidth: width, sidelightGlass: null }));
  assert.equal(result.status, 'Complete', `${width} is an approved fiberglass panel width`);
  assert.ok([`11 3/4"`, `13 3/4"`].includes(String(result.glassCalc?.panelWidth)), `${width} is canonicalized`);
}
const missingSinglePanel = calculateGlassGeometry(line({ config: 'DS', sidelightType: 'Panel', panelSidelightWidth: '', sidelightGlass: null }));
assert.equal(missingSinglePanel.status, 'Glass Detail Needed');
assert.equal(missingSinglePanel.blockers.length, 0, 'missing panel width is not a hard blocker');
assert.match(missingSinglePanel.incompleteDetails[0].message, /right sidelight panel width/i);
assert.doesNotMatch(missingSinglePanel.incompleteDetails[0].message, /shared/i);
const missingSharedPanel = calculateGlassGeometry(line({ config: 'SDS', roWidth: '78', sidelightType: 'Panel', panelSidelightWidth: '', sidelightGlass: null }));
assert.equal(missingSharedPanel.status, 'Glass Detail Needed');
assert.equal(missingSharedPanel.blockers.length, 0);
assert.match(missingSharedPanel.incompleteDetails[0].message, /shared sidelight panel width/i);
const unsupportedPanel = calculateGlassGeometry(line({ sidelightType: 'Panel', panelSidelightWidth: '20', sidelightGlass: null }));
assert.equal(unsupportedPanel.status, 'Blocked');
assert.equal(isGlassLineProductionReady({ ...line(), glassCalcStatus: unsupportedPanel.status, glassBlockers: unsupportedPanel.blockers }), false);
assert.throws(() => applyManualGeometryOverride({ line: { ...line(), lineId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', sidelightType: 'Panel', panelSidelightWidth: '20', sidelightGlass: null }, accessLevel: 'use', acceptedValues: {}, reason: 'Override', actorUserId: 'user', appliedAt: '2026-07-21T12:00:00.000Z' }));
const customWoodPanel = calculateGlassGeometry(line({ material: 'wood', sidelightType: 'Panel', panelSidelightWidth: '20', sidelightGlass: null }));
assert.equal(customWoodPanel.status, 'Complete', 'custom Wood permits another positive width');
assert.equal(calculateGlassGeometry(line({ material: 'wood', sidelightType: 'Panel', panelSidelightWidth: '0', sidelightGlass: null })).status, 'Blocked');
assert.equal(calculateGlassGeometry(line({ sidelightType: 'Panel', panelSidelightWidth: '11.75', sidelightGlass: null })).glassCalc?.panelWidth, `11 3/4"`, 'completing panel width recalculates to the engine result');
const canonicalPanel = normalizeDoorLineInput(line({ sidelightType: 'Panel', panelSidelightWidth: '11.75', sidelightGlass: null }));
assert.equal(canonicalPanel.ok && canonicalPanel.value.panelSidelightWidth, `11 3/4"`, 'persistence receives normalized approved width');

const detailNeeded = calculateGlassGeometry(line({ roWidth: '' }));
assert.equal(detailNeeded.status, 'Glass Detail Needed');
assert.equal(glassLineNeedsAttention({ ...line(), glassCalcStatus: 'Glass Detail Needed' })[0].code, 'glass_detail_needed');
assert.equal(isGlassLineProductionReady({ ...line(), lineStatus: 'Active', glassCalcStatus: 'Glass Detail Needed' }), false);
const blocked = calculateGlassGeometry(line({ roWidth: '12' }));
assert.equal(blocked.status, 'Blocked');
assert.equal(blocked.blockers.length > 0, true);

const warningLine = line({ lineId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', roHeight: `7'0"` });
const warning = calculateGlassGeometry(warningLine);
assert.equal(warning.status, 'Warning');
const approval = applyManualGeometryOverride({ line: warningLine, accessLevel: 'use', acceptedValues: warning.glassCalc as GlassGeometryValues, reason: 'Site dimensions verified', actorUserId: 'user-1', actorDisplayName: 'Barrett', appliedAt: '2026-07-21T12:00:00.000Z' });
assert.equal(approval.reason, 'Site dimensions verified');
assert.throws(() => applyManualGeometryOverride({ line: warningLine, accessLevel: 'view', acceptedValues: {}, reason: 'No', actorUserId: 'viewer', appliedAt: '2026-07-21T12:00:00.000Z' }));
assert.throws(() => applyManualGeometryOverride({ line: { ...warningLine, roWidth: '' }, accessLevel: 'use', acceptedValues: {}, reason: 'No', actorUserId: 'user', appliedAt: '2026-07-21T12:00:00.000Z' }));
const overridden = calculateGlassGeometry({ ...warningLine, glassOverride: approval });
assert.equal(overridden.status, 'Manual Override');
assert.equal(isGlassLineProductionReady({ ...warningLine, lineStatus: 'Active', glassCalcStatus: overridden.status, glassBlockers: [] }), true);
assert.deepEqual(glassLineNeedsAttention({ ...warningLine, lineStatus: 'Active', glassCalcStatus: 'Manual Override', glassOverride: approval }), []);

const mirrored = retainCompatibleGlassFields({ ...line(), sidelightMeasurementLeft: `1'0"` }, 'DS', 'Glass');
assert.equal(mirrored.sidelightMeasurementLeft, null);
assert.equal(mirrored.sidelightMeasurementRight, null);
const toPanel = retainCompatibleGlassFields({ ...line(), glassCalc: { old: 'value' }, glassOverride: approval }, 'SD', 'Panel');
assert.equal(toPanel.glassCalc, null); assert.equal(toPanel.glassOverride, null); assert.equal(toPanel.sidelightGlass, null);
const toPlain = retainCompatibleGlassFields(line(), 'D', null);
assert.equal(toPlain.roWidth, null); assert.equal(toPlain.glassCalcStatus, 'Not Needed');
assert.equal(geometryChanged(line(), { ...line(), notes: 'unrelated' }), false);
assert.equal(geometryChanged(line(), { ...line(), roWidth: '61' }), true);

const incompleteNormalized = normalizeDoorLineInput(line({ roWidth: '' }));
assert.equal(incompleteNormalized.ok && incompleteNormalized.value.glassCalcStatus, 'Glass Detail Needed', 'partial glass line is save-valid');
assert.equal(normalizeDoorLineInput(line({ roWidth: '12' })).ok, false, 'hard-blocked geometry is rejected');

for (const config of ['DSS', 'DSSS', 'SSD', 'SSSD', 'T/DSS', 'T/DSSS']) {
  const repeated = calculateGlassGeometry(line({
    config, roWidth: '96', roHeight: config.startsWith('T/') ? '100' : '',
    sidelightGlass: 'CLR_SB60_K4SG', transomGlass: config.startsWith('T/') ? 'CLR_SB60_K4SG' : '',
  }));
  assert.equal(repeated.status, 'Complete', config);
  const count = config.replace(/^T\//, '').replace('D', '').length;
  assert.equal(repeated.glassUnits.filter((unit) => /sidelight/i.test(unit.position)).length, count);
  assert.deepEqual(repeated.glassUnits.filter((unit) => /sidelight/i.test(unit.position)).map((unit) => unit.qty), Array(count).fill(1));
  assert.equal(repeated.glassCalc?.headerWidth, `94"`);
  assert.equal(repeated.glassCalc?.sidelightHeight, `79 1/8"`);
  if (config.startsWith('T/')) assert.ok(repeated.glassUnits.some((unit) => unit.position === 'Transom'));
}
const dss = calculateGlassGeometry(line({ config: 'DSS', roWidth: '96', sidelightGlass: 'CLR_SB60_K4SG' }));
assert.equal(dss.glassCalc?.sidelightWidth, `26 5/8"`);
assert.deepEqual(dss.glassUnits.map((unit) => unit.position), ['Right sidelight 1', 'Right sidelight 2']);
const sssd = calculateGlassGeometry(line({ config: 'SSSD', roWidth: '96', sidelightGlass: 'CLR_SB60_K4SG' }));
assert.deepEqual(sssd.glassUnits.map((unit) => unit.position), ['Left sidelight 1', 'Left sidelight 2', 'Left sidelight 3']);
const dssPanel = calculateGlassGeometry(line({ config: 'DSS', roWidth: '96', sidelightType: 'Panel', panelSidelightWidth: '11.75' }));
assert.equal(dssPanel.glassCalc?.headerWidth, `62 3/4"`);
assert.deepEqual(dssPanel.panelSidelights.map((panel) => panel.position), ['Right sidelight 1', 'Right sidelight 2']);
assert.equal(calculateGlassGeometry(line({ config: 'DSSS', roWidth: '60', sidelightType: 'Panel', panelSidelightWidth: '13.75' })).status, 'Blocked');
const fullHeightRepeated = calculateGlassGeometry(line({
  config: 'DSSS', height: `8'0"`, roWidth: '80', roHeight: '98.75',
}));
const tallRoRepeated = calculateGlassGeometry(line({
  config: 'DSSS', height: `8'0"`, roWidth: '80', roHeight: '104',
}));
assert.equal(fullHeightRepeated.glassCalc?.jambLeg, tallRoRepeated.glassCalc?.jambLeg, 'excess non-transom RO height does not lengthen jamb legs');
assert.equal(fullHeightRepeated.glassCalc?.sidelightHeight, tallRoRepeated.glassCalc?.sidelightHeight, 'excess non-transom RO height does not lengthen sidelights');
assert.ok(tallRoRepeated.warnings.some((warning) => warning.code === 'ro_taller_than_standard'), 'taller non-transom RO retains the existing extension warning');
const standardTransomRepeated = calculateGlassGeometry(line({
  config: 'T/DSSS', height: `8'0"`, roWidth: '80', roHeight: '106',
}));
const tallTransomRepeated = calculateGlassGeometry(line({
  config: 'T/DSSS', height: `8'0"`, roWidth: '80', roHeight: '112',
}));
assert.equal(standardTransomRepeated.glassCalc?.jambLeg, `105 1/2"`, 'transom jamb legs use RO height minus one half inch');
assert.equal(tallTransomRepeated.glassCalc?.jambLeg, `111 1/2"`, 'taller transom RO lengthens the full-unit jamb legs');
assert.equal(standardTransomRepeated.glassCalc?.sidelightHeight, tallTransomRepeated.glassCalc?.sidelightHeight, 'transom RO height does not lengthen sidelights');
assert.notEqual(standardTransomRepeated.glassCalc?.transomHeight, tallTransomRepeated.glassCalc?.transomHeight, 'additional transom RO height changes transom height');
const repeatedGlassMissingTransom = calculateGlassGeometry(line({
  config: 'T/DSSS', roWidth: '96', roHeight: '100', sidelightType: 'Glass',
  sidelightGlass: 'CLR_SB60_K4SG', transomGlass: '',
}));
assert.deepEqual(repeatedGlassMissingTransom.incompleteDetails.map((issue) => issue.code), ['transom_glass_required']);
assert.equal(repeatedGlassMissingTransom.incompleteDetails.some((issue) => issue.code === 'sidelight_type_required'), false);
const repeatedPanelMissingTransom = calculateGlassGeometry(line({
  config: 'T/DSSS', roWidth: '96', roHeight: '100', sidelightType: 'Panel',
  panelSidelightWidth: '11.75', sidelightGlass: '', transomGlass: '',
}));
assert.equal(repeatedPanelMissingTransom.incompleteDetails.some((issue) => issue.code === 'sidelight_type_required'), false);

const hours = calculateJ2AShopHours(GLASS_CONFIGS.map((config, index) => line({ config, lineId: String(index), qty: 1 })));
assert.equal(hours.shopHours, 36.5, 'all ten J2B base rules total 2,190 minutes');
assert.equal(calculateJ2AShopHours([line({ config: 'SDDS' })]).shopHours, 4.5);
assert.equal(calculateJ2AShopHours([line({ config: 'T/SDDS' })]).shopHours, 5.5);
assert.deepEqual(calculateJ2AShopHours([line({ config: 'DSS' })]).unknown, ['Line 1: Exterior DSS']);
assert.equal(calculateJ2AShopHours([line({ config: 'SD', qty: 2, prep: 'MULTI', ripJamb: 'Yes' })]).shopHours, 8, 'quantity, multipoint and RIP additions apply');

const unequalSource = line({ config: 'SDS', roWidth: '78', sidelightSpecifications: [
  { side: 'left', index: 1, finishedWidth: '15', tBarSize: null, glassTypeCode: 'CLEAR', customGlassDescription: null, panelSizeMode: null, panelConstructionNotes: null },
  { side: 'right', index: 1, finishedWidth: '20', tBarSize: null, glassTypeCode: 'SATIN_ETCH', customGlassDescription: null, panelSizeMode: null, panelConstructionNotes: null },
] });
const unequalRo = reconcileGlassDimensionCommit(unequalSource, { kind: 'roWidth', value: '80' });
assert.equal(unequalRo.blockers.length, 0);
assert.deepEqual(unequalRo.sourcePatch.sidelightSpecifications?.map((entry) => entry.finishedWidth), [`16 1/8"`, `21 1/8"`]);
const rightAuthoritative = reconcileGlassDimensionCommit({ ...unequalSource, ...unequalRo.sourcePatch }, { kind: 'sidelightWidth', side: 'right', index: 1, value: '24' });
assert.equal(rightAuthoritative.sourcePatch.sidelightSpecifications?.[0].finishedWidth, `16 1/8"`);
assert.equal(rightAuthoritative.sourcePatch.roWidth, `82 7/8"`);
const repeatedRo = reconcileGlassDimensionCommit(line({ config: 'DSSS', roWidth: '96' }), { kind: 'roWidth', value: '97 1/16' });
assert.equal(repeatedRo.sourcePatch.sidelightSpecifications?.length, 3);
assert.equal(repeatedRo.sourcePatch.sidelightSpecifications?.at(-1)?.finishedWidth, `17 5/16"`, 'rounding residual is deterministic');
const oneSide = reconcileGlassDimensionCommit(line(), { kind: 'roWidth', value: '61' });
assert.equal(oneSide.sourcePatch.sidelightSpecifications?.[0].finishedWidth, `20 5/8"`, 'one sidelight absorbs the complete RO change');
const equalSides = reconcileGlassDimensionCommit(line({ config: 'SDS', roWidth: '78' }), { kind: 'roWidth', value: '79' });
assert.deepEqual(equalSides.sourcePatch.sidelightSpecifications?.map((entry) => entry.finishedWidth), [`18 1/8"`, `18 1/8"`]);
const invalidCommit = reconcileGlassDimensionCommit(unequalSource, { kind: 'sidelightWidth', side: 'left', index: 1, value: '0' });
assert.deepEqual(invalidCommit.sourcePatch, {}, 'invalid committed input does not erase valid canonical source');
const transomAuthoritative = reconcileGlassDimensionCommit(line({ config: 'T/SDS', roWidth: '78', roHeight: '96', sidelightSpecifications: unequalSource.sidelightSpecifications }), { kind: 'transomWidth', value: '80' });
assert.equal(transomAuthoritative.blockers.length, 0);
assert.equal(transomAuthoritative.calculatedGeometry.glassCalc?.transomWidth, `80"`, 'committed transom width remains authoritative');
assert.equal(transomAuthoritative.sourcePatch.roWidth, `82 1/8"`, 'transom authority recalculates RO');
for (const [type, expected] of [['Panel', '1.5'], ['Glass', '2.25']] as const) {
  const reconciled = reconcileGlassDimensionCommit(line({ sidelightType: type, panelSidelightWidth: type === 'Panel' ? '11.75' : null }), { kind: 'roWidth', value: '60' });
  assert.equal(reconciled.sourcePatch.sidelightSpecifications?.[0].tBarSize, expected);
}
const customPanel = calculateGlassGeometry(line({ roWidth: '61', sidelightType: 'Panel', panelSidelightWidth: null, sidelightGlass: null, sidelightSpecifications: [
  { side: 'left', index: 1, finishedWidth: '20', tBarSize: '2.25', glassTypeCode: null, customGlassDescription: null, panelSizeMode: 'custom', panelConstructionNotes: 'Build from slab.' },
] }));
assert.equal(customPanel.status, 'Complete');
assert.equal(customPanel.panelSidelights[0].constructionNotes, 'Build from slab.');
const customPanelNoNotes = calculateGlassGeometry(line({ roWidth: '61', sidelightType: 'Panel', panelSidelightWidth: null, sidelightGlass: null, sidelightSpecifications: [
  { side: 'left', index: 1, finishedWidth: '20', tBarSize: null, glassTypeCode: null, customGlassDescription: null, panelSizeMode: 'custom', panelConstructionNotes: null },
] }));
assert.equal(customPanelNoNotes.status, 'Warning');
const customGlass = calculateGlassGeometry(line({ sidelightSpecifications: [
  { side: 'left', index: 1, finishedWidth: '20', tBarSize: '1.5', glassTypeCode: 'CUSTOM', customGlassDescription: 'Rain glass', panelSizeMode: null, panelConstructionNotes: null },
] }));
assert.equal(customGlass.glassUnits[0].glassType, 'Rain glass');
assert.equal(((customGlass.glassCalc?.resolvedSidelights as Array<{tBar:{nonStandard:boolean}}>)?.[0].tBar.nonStandard), true, 'Glass sidelight 1.5 override is non-standard');
assert.equal(calculateGlassGeometry(line({ sidelightSpecifications: [{ side: 'left', index: 1, finishedWidth: '20', tBarSize: null, glassTypeCode: 'CUSTOM', customGlassDescription: ' ', panelSizeMode: null, panelConstructionNotes: null }] })).status, 'Blocked');
assert.equal(calculateGlassGeometry(line({ sidelightGlass: 'mystery' })).status, 'Blocked');
const mixedSidelights = calculateGlassGeometry(line({ config: 'SDS', roWidth: '76.75', sidelightSpecifications: [
  { side: 'left', index: 1, finishedWidth: '11.75', tBarSize: null, glassTypeCode: null, customGlassDescription: null, panelSizeMode: 'standard', panelConstructionNotes: null },
  { side: 'right', index: 1, finishedWidth: '20', tBarSize: null, glassTypeCode: 'CUSTOM', customGlassDescription: 'Rain glass', panelSizeMode: null, panelConstructionNotes: null },
] }));
assert.equal(mixedSidelights.status, 'Complete', 'mixed Panel and Glass sidelights calculate independently');
assert.equal(mixedSidelights.panelSidelights[0].position, 'Left sidelight 1');
assert.equal(mixedSidelights.glassUnits[0].position, 'Right sidelight 1');
assert.deepEqual((mixedSidelights.glassCalc?.resolvedSidelights as Array<{sidelightType:string;tBar:{resolvedSize:string}}>).map((entry) => [entry.sidelightType, entry.tBar.resolvedSize]), [['Panel', '1.5'], ['Glass', '2.25']]);
const preservedSelections = calculateGlassGeometry(line({ config: 'SDS', roWidth: '77.5', sidelightSpecifications: [
  { side: 'left', index: 1, finishedWidth: '12', tBarSize: '2.25', glassTypeCode: null, customGlassDescription: null, panelSizeMode: 'custom', panelConstructionNotes: 'Custom panel' },
  { side: 'right', index: 1, finishedWidth: '20', tBarSize: '1.5', glassTypeCode: 'SATIN_ETCH', customGlassDescription: null, panelSizeMode: null, panelConstructionNotes: null },
] }));
assert.deepEqual((preservedSelections.glassCalc?.resolvedSidelights as Array<{tBar:{resolvedSize:string}}>).map((entry) => entry.tBar.resolvedSize), ['2.25', '1.5'], 'valid saved T-bars are preserved');
const singleTransomOverride = calculateGlassGeometry(line({ config: 'T/SD', roHeight: '96', transomTBarSize: '2.25' }));
assert.equal((singleTransomOverride.glassCalc?.transomTBar as {automaticDefault:string;nonStandard:boolean}).automaticDefault, '1.5');
assert.equal((singleTransomOverride.glassCalc?.transomTBar as {nonStandard:boolean}).nonStandard, true);
const doubleTransomOverride = calculateGlassGeometry(line({ config: 'T/SDDS', roWidth: '96', roHeight: '96', transomTBarSize: '1.5' }));
assert.equal((doubleTransomOverride.glassCalc?.transomTBar as {automaticDefault:string;nonStandard:boolean}).automaticDefault, '2.25');
assert.equal((doubleTransomOverride.glassCalc?.transomTBar as {nonStandard:boolean}).nonStandard, true);
assert.equal(calculateGlassGeometry(line({ transomTBarSize: '2' as never })).status, 'Blocked');
const immutableLegacy = line();
const immutableLegacySnapshot = structuredClone(immutableLegacy);
calculateGlassGeometry(immutableLegacy);
assert.deepEqual(immutableLegacy, immutableLegacySnapshot, 'calculating an old record does not rewrite it');

const complete = normalizeDoorLineInput(line());
const incomplete = normalizeDoorLineInput(line({ roWidth: '' }));
assert.equal(complete.ok && incomplete.ok && doorLineEquivalenceKey(complete.value) === doorLineEquivalenceKey(incomplete.value), false, 'Complete and Glass Detail Needed do not merge');
assert.notEqual(doorLineEquivalenceKey(line({ config: 'SD' })), doorLineEquivalenceKey(line({ config: 'DS' })));
assert.notEqual(doorLineEquivalenceKey(line({ sidelightType: 'Glass' })), doorLineEquivalenceKey(line({ sidelightType: 'Panel' })));
console.log('J2B1 glass geometry domain contract: PASS');
