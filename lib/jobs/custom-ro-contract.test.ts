import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultDoorLine, normalizeDoorLineInput } from './door-line-contract';
import { replaceDoorLineById } from './door-line-editor-state';
import { usesCustomRo } from './custom-ro-contract';
import { doubleDoorCoreWidth } from './double-door-astragal-contract';
import { calculateNonGlassFrameCut } from './non-glass-frame-cut-contract';
import { createWorkOrderRowGroup } from './work-order-document-contract';
import { createHostedJobIntakeRepository } from './hosted-job-intake-repository';
import { createLocalJobIntakeRepository } from './local-job-intake-repository';
import type { DoorLineInput, NativeDoorLine } from './job-intake-types';

const ordinary = defaultDoorLine('Exterior');
const custom = { ...ordinary, customSlab: 'RO' };
const dd = { ...custom, config: 'DD' };
function saved(input: DoorLineInput): NativeDoorLine {
  const result = normalizeDoorLineInput(input);
  assert.ok(result.ok, JSON.stringify(result));
  return { ...result.value, lineId: '11111111-1111-4111-8111-111111111111', lineIndex: 1, lineStatus: 'Active',
    createdAt: '', updatedAt: '', createdByUserId: 'tester', updatedByUserId: 'tester' };
}
function calculated(input: DoorLineInput) {
  const result = calculateNonGlassFrameCut(saved(input));
  assert.equal(result.status, 'Complete');
  assert.ok(result.values);
  return { ...result, values: result.values };
}
function printed(input: DoorLineInput) {
  const group = createWorkOrderRowGroup(saved(input), null);
  return { group, text: JSON.stringify(group).replaceAll('\u00a0', ' ') };
}

for (const mode of ['Interior', 'Exterior'] as const) {
  for (const config of ['D', 'DD']) {
    const input = { ...defaultDoorLine(mode), config };
    assert.equal(usesCustomRo(input), false);
    assert.equal(usesCustomRo({ ...input, customSlab: 'RO' }), true);
    assert.deepEqual(calculated({ ...input, roWidth: 'bad', roHeight: '1' }), calculated(input), 'Standard ignores even invalid stale RO dimensions');
    assert.deepEqual(calculated({ ...input, customSlab: 'RO', roWidth: '150', roHeight: '150' }).warnings, []);
  }
}
for (const config of ['PKT', 'B.P.', 'T/DD', 'SD']) assert.equal(usesCustomRo({ ...custom, config }), false);
assert.equal(usesCustomRo({ ...dd, doubleDoorSizing: { kind: 'patio', preset: '5' } }), false);

for (const roWidth of ['', '38', '50']) {
  const result = calculated({ ...custom, roWidth });
  assert.equal(result.values.finalSlabWidth.inches, 35.75);
  assert.equal(result.values.headerWidth?.inches, 36);
  assert.equal(result.values.widthCutDown?.inches, 0);
  assert.deepEqual(result.warnings, []);
}
const quarterCut = calculated({ ...custom, roWidth: '37 3/4' });
assert.equal(quarterCut.values.headerWidth?.inches, 35.75);
assert.equal(quarterCut.values.finalSlabWidth.inches, 35.5);
assert.equal(quarterCut.values.widthCutDown?.inches, 0.25);
assert.ok(quarterCut.warnings.some((entry) => entry.code === 'door_width_cut'));
assert.ok(printed({ ...custom, roWidth: '37 3/4' }).text.includes('Header/Sill: 35 3/4'));
const single = calculated({ ...custom, roWidth: '37 1/2' });
assert.equal(single.values.headerWidth?.inches, 35.5);
assert.equal(single.values.sillOrThresholdWidth?.inches, 35.5);
assert.equal(single.values.finalSlabWidth.inches, 35.25);
assert.equal(single.values.widthCutDown?.inches, 0.5);
assert.equal(single.values.cutDown.inches, 0);
assert.equal(calculated({ ...custom, roWidth: '30' }).values.widthCutDown?.inches, 8, 'No invented single-D maximum');
const interior = calculated({ ...defaultDoorLine('Interior'), customSlab: 'RO', roWidth: '31' });
assert.equal(interior.values.headerWidth?.inches, 29);
assert.equal(interior.values.finalSlabWidth.inches, Math.round((29 - 7 / 32) * 16) / 16, 'Existing Interior D allowance and rounding');

for (const astragal of ['standard-metal-ds347', 'wood-ferco-astra-lock'] as const) {
  for (const mode of ['Interior', 'Exterior'] as const) {
    const input = { ...defaultDoorLine(mode), customSlab: 'RO', config: 'DD', doubleDoorAstragal: astragal };
    const normal = calculated(input);
    const header = normal.values.headerWidth!.inches;
    for (const roWidth of [String(header + 2), String(header + 20)]) {
      const result = calculated({ ...input, roWidth });
      assert.deepEqual(result.warnings, []);
      assert.equal(result.values.headerWidth?.inches, header);
      assert.equal(result.values.activeLeafWidth?.inches, result.values.inactiveLeafWidth?.inches);
    }
    const smallCut = calculated({ ...input, roWidth: String(header + 2 - 1 / 16) });
    assert.equal(smallCut.values.widthCutDown?.inches, 1 / 16);
    assert.equal(smallCut.values.activeLeafWidth?.inches, normal.values.activeLeafWidth?.inches);
    assert.equal(smallCut.values.inactiveLeafWidth?.inches, normal.values.inactiveLeafWidth!.inches - 1 / 16);
    assert.equal(smallCut.values.headerWidth?.inches, header - 1 / 16);
    const result = calculated({ ...input, roWidth: String(header + 1.5) });
    assert.equal(result.values.widthCutDown?.inches, 0.5);
    assert.equal(result.values.activeLeafWidth?.inches, normal.values.activeLeafWidth?.inches);
    assert.equal(result.values.inactiveLeafWidth?.inches, normal.values.inactiveLeafWidth!.inches - 0.5);
    assert.equal(result.values.headerWidth?.inches, header - 0.5);
    assert.equal(result.values.headerWidth?.inches, doubleDoorCoreWidth([result.values.activeLeafWidth!.inches, result.values.inactiveLeafWidth!.inches], astragal, mode === 'Interior' ? -0.5 : 5 / 16));
    assert.match(result.warnings.map((entry) => entry.message).join(' '), /ASTRAGAL EDGE ONLY.*Active slab and inactive hinge edge remain unchanged/);
    const limit = calculated({ ...input, roWidth: String(header) });
    assert.equal(limit.values.widthCutDown?.inches, 2);
    assert.equal(limit.values.widthReviewRequired, false);
    const special = calculated({ ...input, roWidth: String(header - 0.0625) });
    assert.equal(special.values.widthReviewRequired, true);
    assert.equal(special.values.requiredWidthReduction?.inches, 2.0625);
    assert.equal(special.values.widthCutDown?.inches, 0);
    assert.equal(special.values.inactiveLeafWidth?.inches, normal.values.inactiveLeafWidth?.inches);
    for (const field of ['headerWidth', 'sillOrThresholdWidth', 'frameWidth', 'doubleDoorCoreWidth'] as const) assert.equal(special.values[field], null);
    assert.match(special.warnings[0].message, /SPECIAL \/ REVIEW REQUIRED.*2 1\/16/);
  }
}
// The brief's 70-1/16 -> 69-1/2 example uses explicit actual leaves, not a patio preset.
const example = { ...dd, doubleDoorSizing: { kind: 'actual-leaves' as const, activeWidth: 34.5, inactiveWidth: 34.5 }, roWidth: '71 1/2' };
const resolved = calculated(example);
for (const roWidth of ['72 1/16', '73']) {
  const noCut = calculated({ ...example, roWidth });
  assert.equal(noCut.values.headerWidth?.inches, 70.0625);
  assert.equal(noCut.values.widthCutDown?.inches, 0);
  assert.deepEqual(noCut.warnings, []);
}
const smallDd = calculated({ ...example, roWidth: '72' });
assert.equal(smallDd.values.headerWidth?.inches, 70);
assert.equal(smallDd.values.widthCutDown?.inches, 1 / 16);
assert.equal(smallDd.values.activeLeafWidth?.inches, 34.5);
assert.equal(smallDd.values.inactiveLeafWidth?.inches, 34.4375);
const smallDdPrint = printed({ ...example, roWidth: '72' });
assert.ok(smallDdPrint.text.includes('Header/Sill: 70'));
assert.ok(smallDdPrint.text.includes('Cut inactive slab 1/16'));
assert.equal(resolved.values.headerWidth?.inches, 69.5);
assert.equal(resolved.values.requiredWidthReduction?.inches, 9 / 16);
assert.equal(resolved.values.activeLeafWidth?.inches, 34.5);
assert.equal(resolved.values.inactiveLeafWidth?.inches, 33.9375);
const unequal = calculated({ ...example, doubleDoorSizing: { kind: 'actual-leaves', activeWidth: 35.75, inactiveWidth: 33.25 } });
assert.equal(unequal.values.activeLeafWidth?.inches, 35.75);
assert.equal(unequal.values.inactiveLeafWidth?.inches, 32.6875);

for (const config of ['D', 'DD']) {
  for (const hand of ['LH', 'RHOUT']) {
    const input = { ...custom, config, hand };
    const allowance = hand === 'LH' ? 2.25 : 2;
    for (const roHeight of ['', String(79 + allowance + 0.25), '100']) {
      const result = calculated({ ...input, roHeight });
      assert.equal(result.values.jambLeg?.inches, 79 + allowance);
      assert.equal(result.values.finalSlabHeight.inches, 79);
      assert.equal(result.values.cutDown.inches, 0);
      assert.deepEqual(result.warnings, []);
    }
    const result = calculated({ ...input, roHeight: '81' });
    assert.equal(result.values.jambLeg?.inches, 80.5);
    assert.equal(result.values.finalSlabHeight.inches, 80.5 - allowance);
    assert.equal(result.values.cutDown.inches, hand === 'LH' ? 0.75 : 0.5);
    assert.equal(result.values.widthCutDown?.inches, 0);
  }
}
const both = calculated({ ...example, roHeight: '81' });
assert.equal(both.values.finalSlabHeight.inches, 78.25);
assert.equal(both.values.inactiveLeafWidth?.inches, 33.9375);
assert.match(both.detailLines.join(' '), /active 34 1\/2" x 78 1\/4"; inactive 33 15\/16" x 78 1\/4"/);
const interiorHeight = calculated({ ...defaultDoorLine('Interior'), customSlab: 'RO', roHeight: '82' });
assert.equal(interiorHeight.values.finalSlabHeight.inches, 79.25);
assert.equal(interiorHeight.values.jambLeg?.inches, 81.5);
for (const field of ['roWidth', 'roHeight']) {
  for (const value of ['bad', '0', '-1', '1.01', '1']) {
    assert.equal(normalizeDoorLineInput({ ...custom, [field]: value }).ok, false, `${field}: ${value}`);
  }
}
const normalAgain = saved({ ...saved({ ...custom, roWidth: '37.5', roHeight: '81' }), customSlab: 'No' });
assert.equal(normalAgain.roWidth, '37.5');
assert.equal(normalAgain.roHeight, '81');
assert.deepEqual(calculated(normalAgain).warnings, []);
assert.equal(calculated({ ...normalAgain, customSlab: 'RO' }).values.cutDown.inches, 0.75);

const dPrint = printed({ ...custom, roWidth: '37.5', roHeight: '81' });
for (const fragment of ['Final slab: 35 1/4', '78 1/4', 'Header/Sill: 35 1/2', 'Jamb legs: 80 1/2', 'Door will be cut down 3/4']) assert.ok(dPrint.text.includes(fragment), fragment);
const ddPrint = printed({ ...example, roHeight: '81' });
for (const fragment of ['active 34 1/2', 'inactive 33 15/16', 'Header/Sill: 69 1/2', 'Cut inactive slab 9/16', 'ASTRAGAL EDGE ONLY']) assert.ok(ddPrint.text.includes(fragment), fragment);
const specialInput = { ...dd, roWidth: '70', roHeight: '81' };
const specialPrint = printed(specialInput);
assert.equal(specialPrint.group.primaryRow.status, 'Warning');
assert.ok(specialPrint.text.includes('SPECIAL / REVIEW REQUIRED'));
assert.ok(specialPrint.text.includes('4 9/16'));
assert.ok(!specialPrint.text.includes('Final slabs:'));
assert.ok(!specialPrint.text.includes('Header/Sill:'));

// Guard visibility and actual measurement-input wiring without claiming browser acceptance.
const source = readFileSync('components/jobs/DoorLineWorkspace.tsx', 'utf8');
const panel = source.match(/\{usesCustomRo\(editor\) \? <div[^]*?<\/div> : null\}/)?.[0];
assert.ok(panel);
for (const [label, field] of [['RO Width', 'roWidth'], ['RO Height', 'roHeight']]) {
  assert.ok(panel.includes(`label="${label}"`));
  assert.ok(panel.includes(`setDimension('${field}', value)`));
  assert.ok(panel.includes(`String(editor.${field} ?? '')`));
}
assert.ok(!panel.includes(' required'));
assert.match(source, /name === 'customSlab'[^]*?delete next.roWidth; delete next.roHeight;/);

async function persistence() {
  let persisted: Record<string, unknown>[] = [];
  const job = { internal_job_id: '22222222-2222-4222-8222-222222222222', door_go_reference: 'DG-000001', revision: 1 };
  const hosted = createHostedJobIntakeRepository({ client: { rpc: async (_name, args) => {
    if (args.p_lines) persisted = JSON.parse(JSON.stringify(args.p_lines));
    return { data: { job, lines: persisted }, error: null };
  } } });
  const input = { ...example, roHeight: '81' };
  const command = { commandId: '33333333-3333-4333-8333-333333333333', actorUserId: '44444444-4444-4444-8444-444444444444', defaultSalesperson: null, input: { customer: 'Custom RO test' }, lines: [saved(input)] };
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doorgo-custom-ro-'));
  try {
    const options = { enabled: true, runtime: 'test', filePath: path.join(dir, 'jobs.json') };
    const local = createLocalJobIntakeRepository(options);
    for (const repository of [hosted, local]) {
      const created = await repository.create(command);
      const reader = repository === local ? createLocalJobIntakeRepository(options) : repository;
      const loaded = await reader.findById(created.internalJobId);
      assert.ok(loaded);
      assert.equal(loaded.lines[0].customSlab, 'RO');
      assert.equal(loaded.lines[0].roWidth, input.roWidth);
      assert.equal(loaded.lines[0].roHeight, input.roHeight);
      assert.deepEqual(calculateNonGlassFrameCut(loaded.lines[0]), calculated(input));
      const edited = saved({ ...loaded.lines[0], ...specialInput, doubleDoorSizing: null });
      edited.lineId = loaded.lines[0].lineId;
      const lines = replaceDoorLineById(loaded.lines, edited.lineId, edited);
      await repository.update({ internalJobId: loaded.internalJobId, expectedRevision: loaded.revision, actorUserId: command.actorUserId, input: command.input, lines });
      const reopened = await reader.findById(loaded.internalJobId);
      assert.ok(reopened);
      assert.equal(reopened.lines[0].roWidth, '70');
      assert.equal(reopened.lines[0].roHeight, '81');
      assert.equal(calculateNonGlassFrameCut(reopened.lines[0]).values?.widthReviewRequired, true);
      assert.equal(createWorkOrderRowGroup(reopened.lines[0], null).primaryRow.status, 'Warning');
      assert.deepEqual(calculated(reopened.lines[0]), calculated(specialInput), 'No cumulative cuts after normalization/reopen');
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
}
void persistence().then(() => console.log('Custom RO sizing / persistence / output: PASS'));
