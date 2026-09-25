import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { constructionAllowance, CONSTRUCTIONS } from './construction-contract';
import { defaultDoorLine, normalizeDoorLineInput, doorLineEquivalenceKey } from './door-line-contract';
import { createNewDoorSession, newDoorFromSession, rememberNewDoor, replaceDoorLineById } from './door-line-editor-state';
import { calculateNonGlassFrameCut } from './non-glass-frame-cut-contract';
import { calculateGlassGeometry, geometryChanged, roHeightFromTransom, numericDimension } from './glass-geometry-contract';
import { withPatioPreset } from './double-door-sizing-contract';
import { createWorkOrderRowGroup } from './work-order-document-contract';
import { createLocalJobIntakeRepository } from './local-job-intake-repository';
import { createHostedJobIntakeRepository } from './hosted-job-intake-repository';
import type { DoorLineInput, NativeDoorLine } from './job-intake-types';

const low = 'low-profile-quarter-sill' as const;
const label = CONSTRUCTIONS[low].label;
const exterior = defaultDoorLine('Exterior');
function saved(input: DoorLineInput): NativeDoorLine {
  const result = normalizeDoorLineInput(input);
  assert.ok(result.ok, JSON.stringify(result));
  return { ...result.value, lineId: '11111111-1111-4111-8111-111111111111', lineIndex: 1, lineStatus: 'Active',
    createdAt: '', updatedAt: '', createdByUserId: 'tester', updatedByUserId: 'tester' };
}
function frame(input: DoorLineInput) {
  const result = calculateNonGlassFrameCut(input);
  assert.ok(result.values, JSON.stringify(result));
  return { ...result, values: result.values };
}
function output(input: DoorLineInput) {
  return JSON.stringify(createWorkOrderRowGroup(saved(input), null)).replaceAll('\u00a0', ' ');
}

let session = createNewDoorSession();
for (const mode of ['Interior', 'Exterior'] as const) {
  assert.equal(defaultDoorLine(mode).construction, 'standard');
  assert.equal(newDoorFromSession(session, mode).construction, 'standard');
}
session = rememberNewDoor(session, { ...defaultDoorLine('Interior'), construction: low }, null);
assert.equal(newDoorFromSession(session, 'Interior').construction, low);
assert.equal(newDoorFromSession(session, 'Exterior').construction, 'standard');
session = rememberNewDoor(session, { ...exterior, construction: low }, null);
session = rememberNewDoor(session, { ...defaultDoorLine('Interior'), construction: 'standard' }, null);
assert.equal(newDoorFromSession(session, 'Interior').construction, 'standard');
assert.equal(newDoorFromSession(session, 'Exterior').construction, low);
const beforeEdit = structuredClone(session);
assert.equal(rememberNewDoor(session, { ...exterior, construction: 'standard' }, 'existing'), session);
assert.deepEqual(session, beforeEdit);
assert.deepEqual(newDoorFromSession(session), newDoorFromSession(beforeEdit), 'Cancel/Update return to prior new-door state');
assert.equal(newDoorFromSession(createNewDoorSession()).construction, 'standard', 'Fresh browser session has no stored preference');
assert.equal(saved({ ...exterior, construction: undefined, sill: label }).construction, 'standard', 'Never infer construction from descriptive sill text');
assert.equal(normalizeDoorLineInput({ ...exterior, construction: 'unsupported' as never }).ok, false);
assert.notEqual(doorLineEquivalenceKey(exterior), doorLineEquivalenceKey({ ...exterior, construction: low }));
assert.equal(geometryChanged(exterior, { ...exterior, construction: low }), true);
assert.equal(saved({ ...defaultDoorLine('Interior'), config: 'DD', hand: null, construction: low }).hand, null);

for (const mode of ['Interior', 'Exterior'] as const) {
  for (const config of ['D', 'DD']) {
    for (const hand of ['LH', 'RHOUT']) {
      const input = { ...defaultDoorLine(mode), config, hand, construction: low };
      assert.equal(saved(input).hand, hand, 'Low Profile combinations remain saveable');
      const normal = frame(input);
      const slab = normal.values.actualSlabHeight.inches;
      assert.equal(constructionAllowance(low, hand.includes('OUT')), 1.625);
      assert.equal(normal.values.jambLeg?.inches, slab + 1.625);
      for (const roHeight of [String(slab + 1.875), '120']) {
        const result = frame({ ...input, customSlab: 'RO', roHeight });
        assert.equal(result.values.jambLeg?.inches, slab + 1.625);
        assert.equal(result.values.finalSlabHeight.inches, slab);
        assert.deepEqual(result.warnings, []);
      }
      const cut = frame({ ...input, customSlab: 'RO', roHeight: String(slab + 1.75) });
      assert.equal(cut.values.jambLeg?.inches, slab + 1.25);
      assert.equal(cut.values.finalSlabHeight.inches, slab - 0.375);
      assert.equal(cut.values.cutDown.inches, 0.375);
      const header = normal.values.headerWidth!.inches;
      for (const roWidth of [String(header + 2), String(header + 1.75), String(header), String(header - 0.0625)]) {
        const custom = { ...input, customSlab: 'RO', roWidth };
        const result = frame(custom);
        const standard = frame({ ...custom, construction: 'standard' });
        for (const field of ['activeLeafWidth', 'inactiveLeafWidth', 'headerWidth', 'sillOrThresholdWidth', 'widthCutDown', 'requiredWidthReduction', 'widthReviewRequired'] as const) assert.deepEqual(result.values[field], standard.values[field], field);
      }
    }
  }
}
assert.equal(frame({ ...exterior, construction: low }).values.jambLeg?.display, '80 5/8"');
assert.ok(output({ ...exterior, construction: low }).includes('80 5/8'));
assert.equal(createWorkOrderRowGroup(saved({ ...exterior, construction: low }), null).primaryRow.cells.sill, 'LowPro');
assert.ok(!output({ ...exterior, construction: low }).includes('Low Profile'));
assert.equal(output({ ...exterior, construction: undefined }), output({ ...exterior, construction: 'standard' }));
for (const preset of ['5', '6'] as const) {
  for (const hand of ['LH', 'RHOUT']) {
    const input = withPatioPreset({ ...exterior, config: 'DD', construction: low, hand }, preset);
    const result = frame(input);
    assert.equal(result.values.actualSlabHeight.inches, 77);
    assert.equal(result.values.activeLeafWidth?.inches, preset === '5' ? 28.5 : 34.5);
    assert.equal(result.values.inactiveLeafWidth?.inches, result.values.activeLeafWidth?.inches);
    assert.equal(result.values.jambLeg?.inches, 78.625);
    assert.equal(result.values.headerWidth?.inches, preset === '5' ? 58.0625 : 70.0625);
    assert.equal(result.values.cutDown.inches, 0);
    assert.deepEqual(result.warnings, []);
    assert.ok(output(input).includes('78 5/8'));
  }
}

const glassBase: DoorLineInput = { ...exterior, construction: low, config: 'SD', roWidth: '100', sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG', transomGlass: 'CLR_SB60_K4SG' };
for (const construction of ['standard', low] as const) {
  for (const sidelightType of ['Glass', 'Panel'] as const) {
    for (const structured of [false, true]) {
      const input: DoorLineInput = { ...glassBase, construction, sidelightType, panelSidelightWidth: '11.75',
        ...(structured ? { sidelightSpecifications: [{ side: 'left', index: 1, finishedWidth: '11.75', tBarSize: sidelightType === 'Panel' ? '1.5' : '2.25', glassTypeCode: sidelightType === 'Glass' ? 'CLEAR' : null, customGlassDescription: null, panelSizeMode: sidelightType === 'Panel' ? 'standard' : null, panelConstructionNotes: null }] } : {}) };
      for (const roHeight of ['', construction === low ? '80 3/8' : '81']) {
        const result = calculateGlassGeometry({ ...input, roHeight });
        assert.ok(result.glassCalc, JSON.stringify(result));
        const slab = numericDimension(result.glassCalc.finalDoorHeight);
        assert.ok(slab.ok);
        const side = sidelightType === 'Panel' ? result.panelSidelights[0] : result.glassUnits[0];
        const height = numericDimension(side.height);
        assert.ok(height.ok);
        assert.equal(height.inches, slab.inches + 0.125);
        if (roHeight) { assert.equal(slab.inches, 78.25); assert.equal(height.inches, 78.375); }
      }
    }
  }
}
for (const config of ['SD', 'SDS', 'DSS', 'SDDS']) {
  for (const hand of ['LH', 'RHOUT']) {
    for (const roHeight of ['', '80 7/8', '110']) {
      const result = calculateGlassGeometry({ ...glassBase, config, hand, roHeight });
      assert.ok(result.glassCalc, JSON.stringify(result));
      assert.equal(result.glassCalc.jambLeg, '80 5/8"');
      assert.equal(result.glassCalc.finalDoorHeight, '79"');
      assert.deepEqual(result.warnings, []);
    }
  }
}
for (const config of ['T/D', 'T/SD', 'T/SDS', 'T/DD', 'T/SDDS', 'TTT/SDDS']) {
  for (const hand of ['LH', 'RHOUT']) {
    for (const tBar of ['1.5', '2.25'] as const) {
      const input: DoorLineInput = { ...glassBase, config, hand, roHeight: '100', transomTBarSize: tBar, transomGlassTypeCode: 'CLEAR' };
      const lowResult = calculateGlassGeometry(input);
      const standard = calculateGlassGeometry({ ...input, construction: 'standard' });
      assert.ok(lowResult.glassCalc, JSON.stringify(lowResult));
      for (const field of ['headerWidth', 'transomWidth', 'transomTBar', 'divider']) assert.deepEqual(lowResult.glassCalc[field], standard.glassCalc?.[field], `${config}: ${field}`);
      const transom = numericDimension(lowResult.glassCalc.transomHeight);
      assert.ok(transom.ok);
      assert.equal(roHeightFromTransom(79, transom.inches, tBar, hand.includes('OUT') ? 'outswing' : 'inswing', constructionAllowance(low, hand.includes('OUT'))), 100);
      assert.equal(lowResult.glassCalc.jambLeg, '99 1/2"', 'Full transom-unit jamb still follows RO');
    }
  }
}
const ui = readFileSync('components/jobs/DoorLineWorkspace.tsx', 'utf8');
assert.match(ui, /Construction<select[^]*?set\('construction', event.target.value\)/);
assert.match(ui, /name === 'construction'\) newDoorSession.current = rememberNewDoor/);

async function persistence() {
  let persisted: Record<string, unknown>[] = [];
  const job = { internal_job_id: '22222222-2222-4222-8222-222222222222', door_go_reference: 'DG-000001', revision: 1 };
  const hosted = createHostedJobIntakeRepository({ client: { rpc: async (_name, args) => {
    if (args.p_lines) persisted = JSON.parse(JSON.stringify(args.p_lines));
    return { data: { job, lines: persisted }, error: null };
  } } });
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doorgo-construction-'));
  try {
    const options = { enabled: true, runtime: 'test', filePath: path.join(dir, 'jobs.json') };
    const local = createLocalJobIntakeRepository(options);
    for (const repository of [hosted, local]) {
      for (const input of [{ ...exterior, construction: low }, { ...exterior, construction: low, config: 'DD', customSlab: 'RO', roWidth: '74', roHeight: '80 3/8' }, glassBase, { ...glassBase, config: 'T/SDS', roHeight: '100' }]) {
        const command = { commandId: crypto.randomUUID(), actorUserId: '44444444-4444-4444-8444-444444444444', defaultSalesperson: null, input: { customer: 'Construction test' }, lines: [saved(input)] };
        const created = await repository.create(command);
        const reader = repository === local ? createLocalJobIntakeRepository(options) : repository;
        const reopened = await reader.findById(created.internalJobId);
        assert.ok(reopened);
        assert.equal(reopened.lines[0].construction, low);
        assert.equal(output(reopened.lines[0]), output(input));
        if (repository === hosted) {
          assert.equal(persisted[0].construction, undefined, 'No new SQL column');
          assert.equal((persisted[0].glass_calc as Record<string, unknown>).construction, low);
        }
        const edited = { ...reopened.lines[0], construction: 'standard' as const };
        const lines = replaceDoorLineById(reopened.lines, edited.lineId, edited);
        await repository.update({ internalJobId: reopened.internalJobId, expectedRevision: reopened.revision, actorUserId: command.actorUserId, input: command.input, lines });
        const updated = await reader.findById(reopened.internalJobId);
        assert.equal(updated?.lines[0].construction, 'standard');
        assert.ok(!output(updated!.lines[0]).includes('Low Profile'));
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
}
void persistence().then(() => console.log('Construction / Low Profile / lifecycle / persistence: PASS'));
