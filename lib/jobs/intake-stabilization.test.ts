import assert from 'node:assert/strict';
import { defaultDoorLine, normalizeDoorLineInput } from './door-line-contract';
import { calculateGlassGeometry } from './glass-geometry-contract';
import { calculateNonGlassFrameCut } from './non-glass-frame-cut-contract';
import { canonicalSidelightSpecifications, reconcileGlassDimensionCommit } from './glass-dimension-reconciliation-contract';
import { createHostedJobIntakeRepository } from './hosted-job-intake-repository';
import type { DoorLineInput, NativeDoorLine } from './job-intake-types';

const base: DoorLineInput = { ...defaultDoorLine('Exterior'), config: 'T/DD', customSlab: 'RO', roWidth: '74', roHeight: '95', transomGlassTypeCode: 'CLEAR', transomTBarSize: '1.5' };
for (const astragal of ['standard-metal-ds347', 'wood-ferco-astra-lock'] as const) {
  const normal = calculateNonGlassFrameCut({ ...base, config: 'DD', customSlab: 'No', doubleDoorAstragal: astragal });
  assert.ok(normal.values?.headerWidth);
  const normalRo = normal.values.headerWidth.inches + 2;
  for (const cut of [0, 0.5625, 2, 2.0625]) {
    const input = { ...base, doubleDoorAstragal: astragal, roWidth: String(normalRo - cut) };
    const result = calculateGlassGeometry(input);
    if (cut > 2) {
      assert.equal(result.status, 'Blocked');
      assert.equal(result.glassCalc, null);
      assert.match(result.blockers[0].message, /SPECIAL \/ REVIEW REQUIRED/);
    } else {
      const plain = calculateNonGlassFrameCut({ ...input, config: 'DD', roHeight: null });
      assert.equal(result.glassCalc?.activeLeafWidth, plain.values?.activeLeafWidth?.display);
      assert.equal(result.glassCalc?.inactiveLeafWidth, plain.values?.inactiveLeafWidth?.display);
      assert.equal(result.glassCalc?.headerWidth, plain.values?.headerWidth?.display);
      assert.equal(result.glassCalc?.transomWidth, calculateGlassGeometry({ ...input, customSlab: 'No', doubleDoorSizing: { kind: 'actual-leaves', activeWidth: 35.75, inactiveWidth: 35.75 - cut } }).glassCalc?.transomWidth);
      assert.ok(!result.blockers.length);
      if (cut) assert.match(result.warnings[0].message, /ASTRAGAL EDGE ONLY/);
    }
  }
}
assert.equal(calculateGlassGeometry({ ...base, customSlab: 'No' }).blockers[0]?.code, 'ro_too_narrow');
assert.equal(calculateGlassGeometry({ ...base, customSlab: 'No', roWidth: '75' }).status, 'Complete');
const sides = (['left', 'right'] as const).map((side) => ({ side, index: 1, finishedWidth: '12', tBarSize: '1.5' as const, glassTypeCode: side === 'left' ? 'CLEAR' as const : 'SATIN_ETCH' as const, customGlassDescription: null, panelSizeMode: null, panelConstructionNotes: null }));
const withSides: DoorLineInput = { ...base, config: 'T/SDDS', roWidth: '99', sidelightType: 'Glass', sidelightSpecifications: sides };
const normalSides = calculateGlassGeometry({ ...withSides, customSlab: 'No', roWidth: '110' });
assert.ok(normalSides.glassCalc);
const target = 35.75 * 2 + 0.75 + 5/16 + 2 * (12 + 1.5 + .125) + 2 - 1;
const resolved = calculateGlassGeometry({ ...withSides, roWidth: String(target) });
assert.equal(resolved.glassCalc?.inactiveLeafWidth, '34 3/4"');
assert.equal(resolved.glassCalc?.activeLeafWidth, '35 3/4"');
const independent = canonicalSidelightSpecifications(withSides);
assert.deepEqual(independent.map(x => x.side), ['left', 'right']);
assert.notEqual(independent[0], independent[1], 'Physical side records keep separate identity under the existing shared specification');
assert.deepEqual(reconcileGlassDimensionCommit(withSides, { kind: 'roWidth', value: String(target) }).sourcePatch.sidelightSpecifications, undefined, 'DD RO does not resize explicit sidelights before resolving the core');

async function persistence() {
  let rows: Record<string, unknown>[] = [];
  const repository = createHostedJobIntakeRepository({ client: { rpc: async (_name, args) => {
    if (args.p_lines) rows = JSON.parse(JSON.stringify(args.p_lines));
    return { data: { job: { internal_job_id: '22222222-2222-4222-8222-222222222222', door_go_reference: 'DG-000001', revision: 1 }, lines: rows }, error: null };
  } } });
  const normalized = normalizeDoorLineInput(base);
  assert.ok(normalized.ok);
  const line = { ...normalized.value, lineId: '11111111-1111-4111-8111-111111111111', lineIndex: 1, lineStatus: 'Active' } as NativeDoorLine;
  const saved = await repository.create({ commandId: crypto.randomUUID(), actorUserId: '44444444-4444-4444-8444-444444444444', defaultSalesperson: null, input: { customer: 'Composition regression' }, lines: [line] });
  const reopened = await repository.findById(saved.internalJobId);
  assert.equal(reopened?.lines[0].config, 'T/DD');
  assert.equal('glassCompositionConfig' in reopened!.lines[0], false);
  assert.equal(calculateGlassGeometry(reopened!.lines[0]).status, 'Warning');
  assert.equal(calculateGlassGeometry(reopened!.lines[0]).glassCalc?.inactiveLeafWidth, '35 3/16"');
  assert.equal(rows[0].glass_composition_config, undefined, 'Existing JSON payload; no new SQL column');
  console.log('Pass 3A.1 DD glass cut-down / configuration / persistence: PASS');
}
void persistence();
