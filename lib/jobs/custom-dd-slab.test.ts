import assert from 'node:assert/strict';
import { defaultDoorLine, normalizeDoorLineInput } from './door-line-contract';
import { calculateNonGlassFrameCut } from './non-glass-frame-cut-contract';
import { calculateGlassGeometry } from './glass-geometry-contract';
import { createHostedJobIntakeRepository } from './hosted-job-intake-repository';
import { createWorkOrderRowGroup } from './work-order-document-contract';
import type { DoorLineInput, NativeDoorLine } from './job-intake-types';

const standard = { ...defaultDoorLine('Exterior'), config: 'DD' };
const custom: DoorLineInput = { ...standard, customSlab: 'WoodCustom', doubleDoorSizing: { kind: 'custom-slabs', activeWidth: '41-3/4', inactiveWidth: '35-3/4', height: '79' } };
assert.equal(calculateNonGlassFrameCut(standard).values?.headerWidth?.inches, 72.5625);
assert.ok(normalizeDoorLineInput(custom).ok);
assert.equal(normalizeDoorLineInput({ ...custom, doubleDoorSizing: null }).ok, false);
for (const field of ['activeWidth', 'inactiveWidth', 'height']) {
  for (const value of ['', '0', '-1', 'invalid', '41.01']) {
    const input = { ...custom, doubleDoorSizing: { ...custom.doubleDoorSizing!, [field]: value } };
    assert.equal(normalizeDoorLineInput(input).ok, false);
    assert.equal(calculateNonGlassFrameCut(input).status, 'Blocked');
    assert.equal(calculateGlassGeometry({ ...input, config: 'T/DD', roWidth: '81', roHeight: '95' }).status, 'Blocked');
  }
}
const result = calculateNonGlassFrameCut(custom);
assert.equal(result.values?.activeLeafWidth?.inches, 41.75);
assert.equal(result.values?.inactiveLeafWidth?.inches, 35.75);
assert.equal(result.values?.actualSlabHeight.inches, 79);
assert.equal(result.values?.headerWidth?.display, '78 9/16"');
assert.equal(result.values?.recommendedRoWidth?.display, '80 9/16"');
assert.equal(result.values?.cutDown.inches, 0);
assert.deepEqual(result.warnings, []);
assert.equal(result.values?.widthCutDown, undefined);
assert.equal(calculateNonGlassFrameCut({ ...custom, construction: 'low-profile-quarter-sill' }).values?.jambLeg?.inches, 80.625);
const glass: DoorLineInput = { ...custom, config: 'T/DD', roWidth: '80 9/16', roHeight: '95', transomGlassTypeCode: 'CLEAR', transomTBarSize: '1.5' };
const geometry = calculateGlassGeometry(glass);
assert.equal(geometry.glassCalc?.headerWidth, '78 9/16"');
assert.equal(geometry.glassCalc?.recommendedRoWidth, '80 9/16"');
assert.equal(geometry.glassCalc?.transomWidth, '78 7/16"');
assert.equal(geometry.glassCalc?.finalDoorHeight, '79"');
assert.equal(geometry.glassCalc?.inactiveLeafWidth, '35 3/4"');
assert.ok(!geometry.warnings.some(x => /cut|SPECIAL/i.test(x.message)));
const lowProfile = calculateGlassGeometry({ ...glass, construction: 'low-profile-quarter-sill' });
assert.equal(lowProfile.glassCalc?.transomHeight, '12 1/4"');
const taller: DoorLineInput = { ...glass, doubleDoorSizing: { ...custom.doubleDoorSizing as Extract<NonNullable<DoorLineInput['doubleDoorSizing']>, { kind: 'custom-slabs' }>, height: '83' } };
assert.equal(calculateGlassGeometry(taller).glassCalc?.finalDoorHeight, '83"');
assert.equal(calculateGlassGeometry(taller).glassCalc?.transomHeight, '7 5/8"');
const sides = calculateGlassGeometry({ ...glass, config: 'T/SDDS', roWidth: '110', sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG' });
assert.ok(sides.glassCalc, JSON.stringify(sides));
assert.equal(sides.glassCalc.activeLeafWidth, '41 3/4"');
assert.equal(sides.glassCalc.sidelightHeight, '79 1/8"');
// Custom RO uses these starting leaves; unequal starting widths are not a rip.
for (const roWidth of ['80 9/16', '79 9/16']) {
  const cut = calculateNonGlassFrameCut({ ...custom, customSlab: 'RO', roWidth });
  assert.equal(cut.values?.activeLeafWidth?.inches, 41.75);
  assert.equal(cut.values?.widthCutDown?.inches, roWidth === '80 9/16' ? 0 : 1);
  assert.equal(cut.values?.inactiveLeafWidth?.inches, roWidth === '80 9/16' ? 35.75 : 34.75);
}
function normalized(input: DoorLineInput): NativeDoorLine {
  const validated = normalizeDoorLineInput(input);
  assert.ok(validated.ok, JSON.stringify(validated));
  return { ...validated.value, lineId: '11111111-1111-4111-8111-111111111111', lineIndex: 1, lineStatus: 'Active' } as NativeDoorLine;
}
for (const input of [custom, glass]) {
  const output = JSON.stringify(createWorkOrderRowGroup(normalized(input), null)).replaceAll('\u00a0', ' ');
  assert.match(output, /Active slab: 41 3\/4/);
  assert.match(output, /Inactive slab: 35 3\/4/);
  assert.match(createWorkOrderRowGroup(normalized(input), null).primaryRow.cells.size, /Active: 41\s3\/4/);
  assert.doesNotMatch(output, /SPECIAL|Cut inactive slab/);
}
async function persistence() {
  let rows: Record<string, unknown>[] = [];
  const job = { internal_job_id: '22222222-2222-4222-8222-222222222222', door_go_reference: 'DG-000001', revision: 1 };
  const repository = createHostedJobIntakeRepository({ client: { rpc: async (_name, args) => {
    if (args.p_lines) rows = JSON.parse(JSON.stringify(args.p_lines));
    return { data: { job, lines: rows }, error: null };
  } } });
  const command = { commandId: crypto.randomUUID(), actorUserId: '44444444-4444-4444-8444-444444444444', defaultSalesperson: null, input: { customer: 'Custom DD test' }, lines: [normalized(custom)] };
  await repository.create(command);
  const reopened = await repository.findById(job.internal_job_id);
  assert.deepEqual(reopened?.lines[0].doubleDoorSizing, custom.doubleDoorSizing);
  assert.equal(calculateNonGlassFrameCut(reopened!.lines[0]).values?.headerWidth?.inches, 78.5625);
  await repository.update({ internalJobId: job.internal_job_id, expectedRevision: 1, actorUserId: command.actorUserId, input: command.input, lines: [normalized(glass)] });
  const updated = await repository.findById(job.internal_job_id);
  assert.deepEqual(updated?.lines[0].doubleDoorSizing, custom.doubleDoorSizing);
  assert.equal(calculateGlassGeometry(updated!.lines[0]).glassCalc?.headerWidth, '78 9/16"');
  console.log('Custom DD slabs / glass / work order / persistence: PASS');
}
void persistence();
