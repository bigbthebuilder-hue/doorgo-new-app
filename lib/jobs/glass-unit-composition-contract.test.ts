import assert from 'node:assert/strict';
import { reconcileGlassTopology, nextGlassBuilderDraft } from './glass-editor-contract';
import { reconcileGlassDimensionCommit, canonicalSidelightSpecifications } from './glass-dimension-reconciliation-contract';
import { calculateGlassGeometry } from './glass-geometry-contract';
import type { DoorLineInput } from './job-intake-types';
import {
  parseGlassUnitConfiguration, placeSingleSidelightForSwing, resolveGlassUnitConfiguration,
  totalSidelightCount,
} from './glass-unit-composition-contract';

for (const config of ['D', 'DD', 'T/D', 'T/DD', 'SD', 'DS', 'SDS', 'DSS', 'DSSS', 'SSD', 'SSSD', 'SDDS', 'T/SD', 'T/DS', 'T/SDS', 'T/DSS', 'T/DSSS', 'T/SDDS', 'TTT/SDS', 'TTT/SDDS']) {
  const parsed = parseGlassUnitConfiguration(config);
  assert.equal(parsed.ok, true, config);
  if (parsed.ok) assert.equal(resolveGlassUnitConfiguration(parsed.value), config);
}
const alias = parseGlassUnitConfiguration('T-DSS');
assert.equal(alias.ok && alias.canonicalConfig, 'T/DSS');
for (const invalid of ['', 'S', 'DDD', 'D/SS', 'T//D', 'DSD']) assert.equal(parseGlassUnitConfiguration(invalid).ok, false, invalid);

function single(config: string, swing: string) {
  const parsed = parseGlassUnitConfiguration(config);
  assert.ok(parsed.ok);
  return resolveGlassUnitConfiguration(placeSingleSidelightForSwing(parsed.value, swing));
}
assert.equal(single('SD', 'LH'), 'DS');
assert.equal(single('SD', 'RHOUT'), 'DS');
assert.equal(single('DS', 'RH'), 'SD');
assert.equal(single('DS', 'LHOUT'), 'SD');
assert.equal(single('T/SD', 'RHOS'), 'T/DS');
assert.equal(single('T/DS', 'LHOS'), 'T/SD');
const multi = parseGlassUnitConfiguration('DSS');
assert.ok(multi.ok);
assert.equal(resolveGlassUnitConfiguration(placeSingleSidelightForSwing(multi.value, 'RH')), 'DSS');
assert.equal(totalSidelightCount(multi.value), 2);
const source: DoorLineInput = {
  mode: 'Exterior', config: 'T/SDS', width: `3'0"`, height: `6'8"`,
  material: 'fiberglass', customSlab: 'No', hand: 'LH', roWidth: '120.00', roHeight: '100',
  sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG', transomTBarSize: '2.25', transomGlassTypeCode: 'CLEAR', notes: 'Keep notes',
};
const committed = reconcileGlassDimensionCommit(source, { kind: 'roWidth', value: source.roWidth });
assert.deepEqual(committed.blockers, []);
const previous = { ...source, ...committed.sourcePatch, roWidth: source.roWidth };
for (const config of ['T/SDDS', 'T/DSSS', 'TTT/SDS']) {
  const changed = nextGlassBuilderDraft(previous, 'config', config);
  changed.sidelightSpecifications = canonicalSidelightSpecifications(changed);
  const result = reconcileGlassTopology(previous, changed, { kind: 'roWidth' });
  const recommitted = reconcileGlassDimensionCommit(changed, { kind: 'roWidth', value: previous.roWidth });
  assert.deepEqual(result.blockers, [], config);
  assert.equal(result.draft.roWidth, '120.00', 'Preserve exact authoritative RO input');
  assert.equal(result.draft.roHeight, previous.roHeight);
  assert.equal(result.draft.notes, previous.notes);
  assert.deepEqual(calculateGlassGeometry(result.draft), recommitted.calculatedGeometry, config);
  if (config === 'T/SDDS') assert.notEqual(result.draft.sidelightSpecifications?.[0].finishedWidth, previous.sidelightSpecifications?.[0].finishedWidth);
}
for (const authority of [{ kind: 'transomWidth' }, { kind: 'sidelightWidth', side: 'left', index: 1 }] as const) {
  const changed = nextGlassBuilderDraft(previous, 'config', 'T/SDDS');
  const result = reconcileGlassTopology(previous, changed, authority);
  assert.deepEqual(result.blockers, []);
  if (authority.kind === 'transomWidth') assert.equal(result.calculatedGeometry.glassCalc?.transomWidth, calculateGlassGeometry(previous).glassCalc?.transomWidth);
  else assert.equal(result.draft.sidelightSpecifications?.[0].finishedWidth, previous.sidelightSpecifications?.[0].finishedWidth);
}
console.log('Glass Unit Builder composition contract: PASS');
