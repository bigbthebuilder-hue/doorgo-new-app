import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultDoorLine, normalizeDoorLineInput, doorLineEquivalenceKey } from './door-line-contract';
import { PATIO_DOOR_PRESETS, resolvedDoubleDoorLeaves, patioSizingAvailable, withPatioPreset } from './double-door-sizing-contract';
import { doubleDoorCoreWidth } from './double-door-astragal-contract';
import { calculateNonGlassFrameCut } from './non-glass-frame-cut-contract';
import { calculateGlassGeometry } from './glass-geometry-contract';
import { reconcileGlassDimensionCommit } from './glass-dimension-reconciliation-contract';
import { createWorkOrderRowGroup } from './work-order-document-contract';
import { createHostedJobIntakeRepository } from './hosted-job-intake-repository';
import { createLocalJobIntakeRepository } from './local-job-intake-repository';
import type { DoorLineInput, NativeDoorLine } from './job-intake-types';

function line(input: DoorLineInput): NativeDoorLine {
  const result = normalizeDoorLineInput(input);
  assert.ok(result.ok, JSON.stringify(result));
  return { ...result.value, lineId: '11111111-1111-4111-8111-111111111111', lineIndex: 1, lineStatus: 'Active',
    createdAt: '', updatedAt: '', createdByUserId: 'tester', updatedByUserId: 'tester' };
}
const normal = { ...defaultDoorLine('Exterior'), config: 'DD' };
assert.equal(calculateNonGlassFrameCut(line(normal)).values?.headerWidth?.inches, 72.5625);
assert.equal(calculateNonGlassFrameCut(line({ ...defaultDoorLine('Interior'), config: 'DD' })).values?.headerWidth?.inches, 60.25);
assert.equal(doubleDoorCoreWidth([35.75, 33.75], 'standard-metal-ds347', 5 / 16), 70.5625);
const unequal = line({ ...normal, doubleDoorSizing: { kind: 'actual-leaves', activeWidth: 35.75, inactiveWidth: 33.75 } });
assert.equal(calculateNonGlassFrameCut(unequal).values?.headerWidth?.inches, 70.5625);
assert.equal(calculateNonGlassFrameCut(unequal).values?.inactiveLeafWidth?.inches, 33.75);
assert.match(JSON.stringify(createWorkOrderRowGroup(unequal, null)).replaceAll("\u00a0", " "), /Inactive slab: 33 3\/4/);
const glass = { ...normal, config: 'T/DD', roWidth: '76', roHeight: '100', transomGlass: 'CLR_SB60_K4SG' };
assert.equal(calculateGlassGeometry(glass).glassCalc?.headerWidth, '72 9/16"');
assert.equal(calculateGlassGeometry({ ...glass, doubleDoorSizing: unequal.doubleDoorSizing }).glassCalc?.headerWidth, '70 9/16"');
const sides = { ...glass, config: 'T/SDDS', roWidth: '110', sidelightType: 'Glass' as const, sidelightGlass: 'CLR_SB60_K4SG', doubleDoorSizing: unequal.doubleDoorSizing };
const reconciled = reconcileGlassDimensionCommit(sides, { kind: 'roWidth', value: '110' });
assert.deepEqual(reconciled.blockers, []);
assert.equal(reconciled.calculatedGeometry.glassCalc?.headerWidth, '108 1/16"');

for (const preset of ['5', '6'] as const) {
  const input = withPatioPreset({ ...normal, height: `8'0"`, hand: 'RHOUT', prep: 'SINGLE', sill: 'Custom existing sill', roHeight: '70', customSlab: 'RO' }, preset);
  const saved = line(input);
  const factory = PATIO_DOOR_PRESETS[preset];
  assert.deepEqual(resolvedDoubleDoorLeaves(saved.doubleDoorSizing, 35.75), [factory.activeWidth, factory.inactiveWidth]);
  for (const astragal of ['standard-metal-ds347', 'wood-ferco-astra-lock'] as const) {
    const result = calculateNonGlassFrameCut({ ...saved, doubleDoorAstragal: astragal });
    assert.equal(result.status, 'Complete');
    assert.equal(result.values?.actualSlabHeight.inches, 77);
    assert.equal(result.values?.activeLeafWidth?.inches, factory.activeWidth);
    assert.equal(result.values?.inactiveLeafWidth?.inches, factory.inactiveWidth);
    assert.equal(result.values?.headerWidth?.inches, doubleDoorCoreWidth([factory.activeWidth, factory.inactiveWidth], astragal, 5 / 16));
    assert.equal(result.values?.sillOrThresholdWidth?.inches, result.values?.headerWidth?.inches);
    assert.equal(result.values?.cutDown.inches, 0);
    assert.deepEqual(result.warnings, []);
  }
  const result = calculateNonGlassFrameCut(saved);
  assert.equal(result.values?.headerWidth?.display, preset === '5' ? '58 1/16"' : '70 1/16"');
  assert.equal(result.values?.jambLeg?.inches, 79, 'Existing outswing allowance receives factory height');
  assert.equal(calculateNonGlassFrameCut({ ...saved, hand: 'LH' }).values?.jambLeg?.inches, 79.25);
  assert.equal(saved.prep, 'SINGLE');
  assert.equal(saved.sill, input.sill);
  const printed = JSON.stringify(createWorkOrderRowGroup(saved, null)).replaceAll("\u00a0", " ");
  assert.equal(createWorkOrderRowGroup(saved, null).primaryRow.cells.size.replaceAll('\u00a0', ' '), `2 @ ${preset === '5' ? '28 1/2' : '34 1/2'}" x 77"`);
  assert.ok(printed.includes(preset === '5' ? '58 1/16' : '70 1/16'));
  assert.ok(printed.includes(preset === '5' ? '28 1/2' : '34 1/2'));
  assert.ok(printed.includes('77'));
  assert.ok(!printed.includes('Door cut'));
  assert.deepEqual(line(JSON.parse(JSON.stringify(saved))).doubleDoorSizing, saved.doubleDoorSizing);
}
const five = withPatioPreset(normal, '5');
const six = withPatioPreset(five, '6');
assert.equal(calculateNonGlassFrameCut(line(six)).values?.activeLeafWidth?.inches, 34.5);
assert.equal(calculateNonGlassFrameCut(line(withPatioPreset(six, null))).values?.actualSlabHeight.inches, 79);
assert.equal(calculateNonGlassFrameCut(line(withPatioPreset(six, null))).values?.headerWidth?.inches, 72.5625);
assert.notEqual(doorLineEquivalenceKey(five), doorLineEquivalenceKey(six));
for (const input of [{ ...five, mode: 'Interior' }, { ...five, config: 'D' }, { ...five, config: 'T/DD' }]) {
  assert.equal(patioSizingAvailable(input as DoorLineInput), false);
  assert.equal(normalizeDoorLineInput(input as DoorLineInput).ok, false);
}
for (const width of [0, -1, NaN, Infinity, 28.51]) assert.equal(normalizeDoorLineInput({ ...normal, doubleDoorSizing: { kind: 'actual-leaves', activeWidth: width, inactiveWidth: 30 } }).ok, false);

async function persistence() {
  // Mock the real adapter's RPC boundary; use the actual serializer and hydrator.
  let persisted: Record<string, unknown>[] = [];
  const job = { internal_job_id: '22222222-2222-4222-8222-222222222222', door_go_reference: 'DG-000001', revision: 1 };
  const hosted = createHostedJobIntakeRepository({ client: { rpc: async (_name, args) => {
    if (args.p_lines) persisted = JSON.parse(JSON.stringify(args.p_lines));
    return { data: { job, lines: persisted }, error: null };
  } } });
  const command = { commandId: '33333333-3333-4333-8333-333333333333', actorUserId: '44444444-4444-4444-8444-444444444444', defaultSalesperson: null, input: { customer: 'Patio test' }, lines: [five] };
  const created = await hosted.create(command);
  assert.deepEqual(created.lines[0].doubleDoorSizing, five.doubleDoorSizing);
  assert.equal(persisted[0].double_door_sizing, undefined, 'No new SQL column');
  assert.deepEqual((persisted[0].glass_calc as Record<string, unknown>).doubleDoorSizing, five.doubleDoorSizing);
  const reopened = await hosted.findById(job.internal_job_id);
  assert.ok(reopened);
  assert.equal(calculateNonGlassFrameCut(reopened.lines[0]).values?.headerWidth?.inches, 58.0625);
  await hosted.update({ internalJobId: job.internal_job_id, expectedRevision: 1, actorUserId: command.actorUserId, input: command.input, lines: [six] });
  assert.deepEqual((await hosted.findById(job.internal_job_id))?.lines[0].doubleDoorSizing, six.doubleDoorSizing);
  await hosted.update({ internalJobId: job.internal_job_id, expectedRevision: 1, actorUserId: command.actorUserId, input: command.input, lines: [unequal] });
  const unequalReopened = await hosted.findById(job.internal_job_id);
  assert.ok(unequalReopened);
  assert.deepEqual(unequalReopened.lines[0].doubleDoorSizing, unequal.doubleDoorSizing);
  assert.equal(calculateNonGlassFrameCut(unequalReopened.lines[0]).values?.headerWidth?.inches, 70.5625);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doorgo-patio-test-'));
  try {
    const options = { enabled: true, runtime: 'test', filePath: path.join(dir, 'jobs.json') };
    const local = createLocalJobIntakeRepository(options);
    const saved = await local.create(command);
    const loaded = await createLocalJobIntakeRepository(options).findById(saved.internalJobId);
    assert.deepEqual(loaded?.lines[0].doubleDoorSizing, five.doubleDoorSizing);
    assert.ok(loaded);
    await local.update({ internalJobId: saved.internalJobId, expectedRevision: saved.revision, actorUserId: command.actorUserId, input: command.input, lines: [{ ...loaded.lines[0], ...six }] });
    assert.deepEqual((await createLocalJobIntakeRepository(options).findById(saved.internalJobId))?.lines[0].doubleDoorSizing, six.doubleDoorSizing);
  } finally { await rm(dir, { recursive: true, force: true }); }
}
void persistence().then(() => console.log('DD sizing / Patio Door Replacement: PASS'));
