import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultDoorLine, normalizeDoorLineInput } from './door-line-contract';
import { calculateNonGlassFrameCut } from './non-glass-frame-cut-contract';
import { calculateGlassGeometry, numericDimension, roHeightFromTransom } from './glass-geometry-contract';
import { constructionAllowance } from './construction-contract';
import { createHostedJobIntakeRepository } from './hosted-job-intake-repository';
import { createLocalJobIntakeRepository } from './local-job-intake-repository';
import { createWorkOrderRowGroup } from './work-order-document-contract';
import { createNewDoorSession, rememberNewDoor, newDoorFromSession, duplicateDoorLine } from './door-line-editor-state';
import type { DoorLineInput, NativeDoorLine } from './job-intake-types';

const base: DoorLineInput = { ...defaultDoorLine('Exterior'), construction: 'jamb-four-sides' };
function frame(line: DoorLineInput) {
  const result = calculateNonGlassFrameCut(line);
  assert.ok(result.values, JSON.stringify(result));
  return result.values;
}
const d = frame(base);
assert.equal(d.actualSlabWidth.inches, 35.75);
assert.equal(d.actualSlabHeight.inches, 79);
for (const [key, value] of Object.entries({ clearOpeningWidth: 36, clearOpeningHeight: 79.25, frameWidth: 37.5, frameHeight: 80.75, recommendedRoWidth: 38, recommendedRoHeight: 81.25, minimumRoWidth: 37.75, minimumRoHeight: 81 })) {
  assert.equal(d[key as keyof typeof d] && (d[key as keyof typeof d] as { inches: number }).inches, value, key);
}
for (const ro of [{ roWidth: '100', roHeight: '120' }, { roWidth: '37 3/4', roHeight: '81' }]) {
  const fit = frame({ ...base, customSlab: 'RO', ...ro });
  assert.equal(fit.frameWidth?.inches, 37.5);
  assert.equal(fit.frameHeight?.inches, 80.75);
  assert.equal(fit.widthCutDown?.inches, 0);
  assert.equal(fit.cutDown.inches, 0);
}
const cut = frame({ ...base, customSlab: 'RO', roWidth: '37 1/2', roHeight: '80 3/4' });
assert.equal(cut.widthCutDown?.inches, 0.5);
assert.equal(cut.cutDown.inches, 0.5);
const custom: DoorLineInput = { ...base, config: 'DD', customSlab: 'WoodCustom', doubleDoorSizing: { kind: 'custom-slabs', activeWidth: '41 3/4', inactiveWidth: '35 3/4', height: '79' } };
assert.equal(frame(custom).headerWidth?.inches, 78.5625);
assert.equal(frame(custom).frameWidth?.inches, 80.0625);
assert.equal(frame(custom).recommendedRoWidth?.inches, 80.5625);
assert.equal(frame(custom).frameHeight?.inches, 80.75);
assert.equal(frame(custom).inactiveLeafWidth?.inches, 35.75);
assert.deepEqual(calculateNonGlassFrameCut(custom).warnings, []);
const dd: DoorLineInput = { ...base, config: 'DD', customSlab: 'RO' };
const normalDd = frame(dd);
const header = normalDd.headerWidth!.inches;
for (const reduction of [1, 2, 2.0625]) {
  const input = { ...dd, roWidth: String(header + 2 - reduction) };
  const result = frame(input);
  assert.equal(result.activeLeafWidth?.inches, 35.75);
  assert.equal(result.inactiveLeafWidth?.inches, reduction > 2 ? 35.75 : 35.75 - reduction);
  assert.equal(result.widthReviewRequired, reduction > 2);
  assert.match(calculateNonGlassFrameCut(input).warnings[0].message, reduction > 2 ? /SPECIAL/ : /ASTRAGAL EDGE ONLY/);
}
for (const config of ['T/D', 'T/DD', 'T/SD', 'T/SDS', 'SD', 'SDS']) {
  const input: DoorLineInput = { ...base, config, roWidth: '100', roHeight: '100', sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG', transomGlassTypeCode: 'CLEAR' };
  const result = calculateGlassGeometry(input);
  const standard = calculateGlassGeometry({ ...input, construction: 'standard' });
  assert.ok(result.glassCalc, JSON.stringify(result));
  for (const field of ['headerWidth', 'transomWidth', 'sidelightWidth', 'divider', 'transomTBar']) assert.deepEqual(result.glassCalc[field], standard.glassCalc?.[field], config + ':' + field);
  if (config.startsWith('T/')) {
    const tBar = config === 'T/DD' ? '2.25' : '1.5';
    assert.equal((result.glassCalc.transomTBar as { resolvedSize: string }).resolvedSize, tBar);
    const height = numericDimension(result.glassCalc.transomHeight);
    assert.ok(height.ok);
    assert.equal(roHeightFromTransom(79, height.inches, tBar, 'inswing', constructionAllowance(base.construction, false)), 100);
    assert.equal(height.inches, 100 - 79 - Number(tBar) - 1.75 - 0.625);
    assert.equal(calculateGlassGeometry({ ...input, roHeight: '' }).glassCalc, null);
  } else assert.equal(result.glassCalc.jambLeg, '80 3/4"');
  assert.deepEqual(calculateGlassGeometry({ ...input, construction: 'standard' }), standard);
}
const customTransom = calculateGlassGeometry({ ...custom, config: 'T/DD', roHeight: '100', transomGlassTypeCode: 'CLEAR' });
assert.equal(customTransom.glassCalc?.roWidth, '80 9/16"');
assert.equal(customTransom.glassCalc?.headerWidth, '78 9/16"');
assert.equal(newDoorFromSession(rememberNewDoor(createNewDoorSession(), base, null)).construction, base.construction);
assert.equal(duplicateDoorLine(base, 'copy', 2).construction, base.construction);

async function persistence() {
  let stored: Record<string, unknown>[] = [];
  const hosted = createHostedJobIntakeRepository({ client: { rpc: async (_name, args) => {
    if (args.p_lines) stored = JSON.parse(JSON.stringify(args.p_lines));
    return { data: { job: { internal_job_id: '22222222-2222-4222-8222-222222222222', door_go_reference: 'DG-000001', revision: 1 }, lines: stored }, error: null };
  } } });
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doorgo-jamb4-'));
  try {
    const options = { filePath: path.join(dir, 'jobs.json'), enabled: true, runtime: 'test' };
    const local = createLocalJobIntakeRepository(options);
    for (const repository of [hosted, local]) {
      for (const line of [base, custom, { ...custom, config: 'T/DD', roHeight: '100', transomGlassTypeCode: 'CLEAR' as const }]) {
        const normalized = normalizeDoorLineInput(line);
        assert.ok(normalized.ok, JSON.stringify(normalized));
        const created = await repository.create({ commandId: crypto.randomUUID(), actorUserId: 'test', defaultSalesperson: null, input: { customer: 'Jamb test' }, lines: [{ ...normalized.value, lineId: crypto.randomUUID() }] });
        const reader = repository === local ? createLocalJobIntakeRepository(options) : hosted;
        const reopened = await reader.findById(created.internalJobId);
        assert.equal(reopened?.lines[0].construction, 'jamb-four-sides');
        const row = createWorkOrderRowGroup(reopened!.lines[0] as NativeDoorLine, null);
        assert.match(row.primaryRow.cells.notesGlass, /Jamb 4 sides/);
        assert.equal(row.primaryRow.cells.sill, '');
        await repository.update({ internalJobId: created.internalJobId, expectedRevision: created.revision, actorUserId: 'test', input: { customer: 'Jamb test' }, lines: [{ ...reopened!.lines[0], construction: 'standard' }] });
        assert.equal((await reader.findById(created.internalJobId))?.lines[0].construction, 'standard');
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
  console.log('Jamb 4 sides: D/DD, Fit to RO, transoms, sidelights, persistence and work order PASS');
}
void persistence();
