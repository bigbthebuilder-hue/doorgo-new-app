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

function line(overrides: DoorLineInput = {}): DoorLineInput {
  return {
    ...defaultDoorLine('Exterior'), config: 'SD', width: `3'0"`, height: `6'8"`, material: 'fiberglass',
    roWidth: `5'0"`, roHeight: '', sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG',
    transomGlass: 'SAT_SB60_K4SG', ...overrides,
  };
}

const expected = {
  SD: { roWidth: `5'0"`, headerWidth: `4' 10"`, sidelightWidth: `1' 7 5/8"` },
  DS: { roWidth: `5'0"`, headerWidth: `4' 10"`, sidelightWidth: `1' 7 5/8"` },
  SDS: { roWidth: `6'6"`, headerWidth: `6' 4"`, sidelightWidth: `1' 5 5/8"` },
  SDDS: { roWidth: `8'0"`, headerWidth: `7' 10"`, sidelightWidth: `8 3/8"` },
  'T/D': { roWidth: `3'2"`, headerWidth: `3' 0"`, transomWidth: `2' 11 7/8"` },
  'T/DD': { roWidth: `6'3"`, headerWidth: `6' 9/16"`, transomWidth: `6' 7/16"` },
  'T/SD': { roWidth: `5'0"`, headerWidth: `4' 10"`, sidelightWidth: `1' 7 5/8"` },
  'T/DS': { roWidth: `5'0"`, headerWidth: `4' 10"`, sidelightWidth: `1' 7 5/8"` },
  'T/SDS': { roWidth: `6'6"`, headerWidth: `6' 4"`, sidelightWidth: `1' 5 5/8"` },
  'T/SDDS': { roWidth: `8'0"`, headerWidth: `7' 10"`, sidelightWidth: `8 3/8"` },
} as const;

for (const config of GLASS_CONFIGS) {
  const topology = glassConfigurationTopology(config);
  const transom = topology.hasTransom;
  const result = calculateGlassGeometry(line({ config, roWidth: expected[config].roWidth, roHeight: transom ? `8'0"` : '' }));
  assert.equal(result.status, 'Complete', `${config} calculates completely`);
  assert.equal(result.glassCalc?.headerWidth, expected[config].headerWidth, `${config} header formula`);
  if ('sidelightWidth' in expected[config]) assert.equal(result.glassCalc?.sidelightWidth, expected[config].sidelightWidth, `${config} sidelight formula`);
  if ('transomWidth' in expected[config]) assert.equal(result.glassCalc?.transomWidth, expected[config].transomWidth, `${config} transom formula`);
  assert.equal(result.vendorCopyText.length > 0, true, `${config} vendor output`);
}

assert.deepEqual(glassConfigurationTopology('SD').sidelightPositions, ['left']);
assert.deepEqual(glassConfigurationTopology('DS').sidelightPositions, ['right']);
assert.equal(glassConfigurationTopology('T/SDDS').doorCount, 2);
assert.equal(normalizeSidelightType('Glass'), 'Glass');
assert.equal(normalizeSidelightType('Panel'), 'Panel');
assert.equal(normalizeSidelightType('mixed'), null, 'mixed sidelight state is rejected');
assert.equal(normalizeDoorLineInput(line({ sidelightType: 'mixed' as never })).ok, false, 'malformed mixed state is rejected at save validation');

const panel = calculateGlassGeometry(line({ sidelightType: 'Panel', panelSidelightWidth: `1'0"`, sidelightGlass: null }));
assert.equal(panel.status, 'Complete');
assert.equal(panel.panelSidelights[0].qty, 1);
assert.match(panel.workorderDetail, /PANELS/);

const detailNeeded = calculateGlassGeometry(line({ roWidth: '' }));
assert.equal(detailNeeded.status, 'Glass Detail Needed');
assert.equal(glassLineNeedsAttention({ ...line(), glassCalcStatus: 'Glass Detail Needed' })[0].code, 'glass_detail_needed');
assert.equal(isGlassLineProductionReady({ ...line(), lineStatus: 'Active', glassCalcStatus: 'Glass Detail Needed' }), false);
const blocked = calculateGlassGeometry(line({ roWidth: `1'0"` }));
assert.equal(blocked.status, 'Blocked');
assert.equal(blocked.blockers.length > 0, true);

const warningLine = line({ roHeight: `7'0"` });
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
assert.equal(geometryChanged(line(), { ...line(), roWidth: `5'1"` }), true);

const incompleteNormalized = normalizeDoorLineInput(line({ roWidth: '' }));
assert.equal(incompleteNormalized.ok && incompleteNormalized.value.glassCalcStatus, 'Glass Detail Needed', 'partial glass line is save-valid');
assert.equal(normalizeDoorLineInput(line({ roWidth: `1'0"` })).ok, false, 'hard-blocked geometry is rejected');

const hours = calculateJ2AShopHours(GLASS_CONFIGS.map((config, index) => line({ config, lineId: String(index), qty: 1 })));
assert.equal(hours.shopHours, 36.5, 'all ten J2B base rules total 2,190 minutes');
assert.equal(calculateJ2AShopHours([line({ config: 'SDDS' })]).shopHours, 4.5);
assert.equal(calculateJ2AShopHours([line({ config: 'T/SDDS' })]).shopHours, 5.5);
assert.equal(calculateJ2AShopHours([line({ config: 'SD', qty: 2, prep: 'MULTI', ripJamb: 'Yes' })]).shopHours, 8, 'quantity, multipoint and RIP additions apply');

const complete = normalizeDoorLineInput(line());
const incomplete = normalizeDoorLineInput(line({ roWidth: '' }));
assert.equal(complete.ok && incomplete.ok && doorLineEquivalenceKey(complete.value) === doorLineEquivalenceKey(incomplete.value), false, 'Complete and Glass Detail Needed do not merge');
assert.notEqual(doorLineEquivalenceKey(line({ config: 'SD' })), doorLineEquivalenceKey(line({ config: 'DS' })));
assert.notEqual(doorLineEquivalenceKey(line({ sidelightType: 'Glass' })), doorLineEquivalenceKey(line({ sidelightType: 'Panel' })));
console.log('J2B1 glass geometry domain contract: PASS');
