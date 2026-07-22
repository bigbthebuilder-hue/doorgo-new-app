import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { calculateJ2NonGlassFrameCut } from './door-line-contract';
import { calculateNonGlassFrameCut } from './non-glass-frame-cut-contract';
import { createLocalJobIntakeRepository } from './local-job-intake-repository';
import type { NativeDoorLine } from './job-intake-types';

function line(overrides: Partial<NativeDoorLine> = {}): NativeDoorLine {
  return {
    lineId: '11111111-1111-4111-8111-111111111111', lineIndex: 1, lineStatus: 'Active',
    mode: 'Interior', doorType: 'Molded', config: 'D', width: `3'0"`, height: `6'8"`,
    customSlab: 'No', customSlabWidth: null, customSlabHeight: null, hand: 'LH', prep: 'YES',
    glass: null, jambWidth: `4-9/16"`, jambType: 'Primed', sill: null, weatherstrip: null,
    hingeType: 'REG', notes: null, qty: 1, roWidth: null, roHeight: null, material: 'wood',
    doorThickness: null, ripJamb: null, glassCalcStatus: 'Ready', glassWorkorderDetail: null,
    glassWarnings: [], glassBlockers: [], glassOverride: null, glassUnits: [], glassCalc: null,
    vendorCopyText: null, sidelightType: null, sidelightGlass: null, transomGlass: null,
    sidelightMeasurementLeft: null, sidelightMeasurementRight: null, panelSidelightWidth: null,
    panelSidelights: [], createdAt: '2026-07-21T10:00:00.000Z', updatedAt: '2026-07-21T10:00:00.000Z',
    createdByUserId: 'user-1', updatedByUserId: 'user-1', ...overrides, includeDiagramOnWorkOrder: overrides.includeDiagramOnWorkOrder ?? false,
  };
}

function complete(overrides: Partial<NativeDoorLine> = {}) {
  const result = calculateNonGlassFrameCut(line(overrides));
  assert.equal(result.status, 'Complete');
  assert.ok(result.values);
  return result;
}

async function main() {
  const interiorD = complete();
  assert.equal(interiorD.values?.actualSlabWidth.display, `36"`);
  assert.equal(interiorD.values?.actualSlabHeight.display, `80"`);
  assert.equal(interiorD.values?.jambLeg?.display, `81 7/8"`);
  assert.equal(interiorD.values?.headerWidth?.display, `36 1/4"`, '1/4 small rounds to canonical 1/16');
  assert.equal(interiorD.values?.sillOrThresholdWidth, null);
  assert.equal(interiorD.values?.nominalHeight, `6'8"`, 'nominal notation is unchanged');

  const interiorDd = complete({ config: 'DD', hand: null, prep: 'BOTH' });
  assert.equal(interiorDd.values?.doubleDoorCoreWidth?.display, `72 1/4"`);
  assert.equal(interiorDd.values?.headerWidth?.display, `72 1/4"`);

  const exteriorD = complete({ mode: 'Exterior', material: 'fiberglass', hand: 'LH', prep: 'STD', sill: 'STD', weatherstrip: 'WHT', jambWidth: `6-9/16"`, hingeType: 'BB' });
  assert.equal(exteriorD.values?.actualSlabWidth.display, `35 3/4"`);
  assert.equal(exteriorD.values?.actualSlabHeight.display, `79"`);
  assert.equal(exteriorD.values?.jambLeg?.display, `81 1/4"`);
  assert.equal(exteriorD.values?.headerWidth?.display, `36"`);
  assert.equal(exteriorD.values?.sillOrThresholdWidth?.display, `36"`);
  assert.equal(exteriorD.values?.frameWidth?.display, `36"`);

  const exteriorDd = complete({ mode: 'Exterior', config: 'DD', material: 'fiberglass', hand: 'RHOUT', prep: 'STD', sill: 'STD', weatherstrip: 'WHT', jambWidth: `6-9/16"`, hingeType: 'BB' });
  assert.equal(exteriorDd.values?.doubleDoorCoreWidth?.display, `72 9/16"`);
  assert.equal(exteriorDd.values?.headerWidth?.display, `72 9/16"`);
  assert.equal(exteriorDd.values?.jambLeg?.display, `81"`);

  const custom = complete({ mode: 'Exterior', material: 'wood', customSlab: 'WoodCustom', customSlabWidth: '35.75', customSlabHeight: '79.125', hand: 'LH', prep: 'STD', sill: 'STD', weatherstrip: 'WHT', jambWidth: `6-9/16"`, hingeType: 'BB' });
  assert.equal(custom.values?.actualSlabWidth.display, `35 3/4"`);
  assert.equal(custom.values?.actualSlabHeight.display, `79 1/8"`);

  const missingCustom = calculateNonGlassFrameCut(line({ customSlab: 'WoodCustom', customSlabWidth: null, customSlabHeight: null }));
  assert.equal(missingCustom.status, 'Incomplete');
  assert.deepEqual(missingCustom.missingFields, ['customSlabWidth', 'customSlabHeight']);
  const invalidCustom = calculateNonGlassFrameCut(line({ customSlab: 'WoodCustom', customSlabWidth: 'bad', customSlabHeight: '79' }));
  assert.equal(invalidCustom.status, 'Blocked');
  assert.equal(invalidCustom.blockers[0]?.code, 'invalid_custom_slab_width');

  const cutDown = complete({ roHeight: '78' });
  assert.equal(cutDown.values?.jambLeg?.display, `77 1/2"`);
  assert.equal(cutDown.values?.finalSlabHeight.display, `75 5/8"`);
  assert.equal(cutDown.values?.cutDown.display, `4 3/8"`);
  assert.match(cutDown.detailLines.join('\n'), /Door cut to 75 5\/8"/);

  const impossible = calculateNonGlassFrameCut(line({ roHeight: '1' }));
  assert.equal(impossible.status, 'Blocked');
  assert.ok(impossible.blockers.some((entry) => entry.code === 'nonpositive_final_slab_height'));

  const bpEntered = complete({ config: 'B.P.', hand: null, prep: 'HALF', jambWidth: null, jambType: null, hingeType: null, roHeight: '80' });
  assert.equal(bpEntered.values?.finishedOpeningWidth, null);
  assert.equal(bpEntered.values?.finishedOpeningHeight?.display, `80"`);
  assert.equal(bpEntered.values?.finalSlabHeight.display, `77 1/4"`);
  assert.deepEqual(bpEntered.detailLines, [`F.O. Height: 80"`, `Door height: 77 1/4"`]);

  const bpBlank = complete({ config: 'B.P.', hand: null, prep: 'NO', jambWidth: null, jambType: null, hingeType: null, roHeight: null });
  assert.equal(bpBlank.values?.finishedOpeningHeight?.display, `82 3/4"`);
  assert.equal(bpBlank.values?.finalSlabHeight.display, `80"`);
  const bpInvalid = calculateNonGlassFrameCut(line({ config: 'B.P.', hand: null, prep: 'NO', jambWidth: null, jambType: null, hingeType: null, roHeight: 'bad' }));
  assert.equal(bpInvalid.status, 'Blocked');
  const bpNonpositive = calculateNonGlassFrameCut(line({ config: 'B.P.', hand: null, prep: 'NO', jambWidth: null, jambType: null, hingeType: null, roHeight: '2' }));
  assert.equal(bpNonpositive.status, 'Blocked');

  assert.equal(calculateNonGlassFrameCut(line({ config: 'PKT', hand: null, jambWidth: null, jambType: null, hingeType: null })).status, 'Not Applicable');
  assert.deepEqual(calculateNonGlassFrameCut(line({ mode: '' as 'Interior' })), { ...calculateNonGlassFrameCut(line({ mode: '' as 'Interior' })) }, 'missing mode is deterministic');
  assert.equal(calculateNonGlassFrameCut(line({ mode: '' as 'Interior' })).status, 'Incomplete');

  const frozen = Object.freeze(line());
  const before = JSON.stringify(frozen);
  const direct = calculateNonGlassFrameCut(frozen);
  assert.deepEqual(direct, calculateNonGlassFrameCut(frozen), 'deeply equal input produces deeply equal output');
  assert.equal(JSON.stringify(frozen), before, 'frozen input is not mutated');
  assert.deepEqual(calculateJ2NonGlassFrameCut(frozen), direct, 'J2 helper uses the same calculator result');

  const directory = await mkdtemp(path.join(os.tmpdir(), 'doorgo-frame-cut-'));
  const filePath = path.join(directory, 'store.json');
  const repository = createLocalJobIntakeRepository({ filePath, enabled: true, runtime: 'test', uuid: () => '22222222-2222-4222-8222-222222222222', now: () => new Date('2026-07-21T12:00:00.000Z') });
  try {
    const job = await repository.create({ commandId: 'frame-cut', actorUserId: 'user-1', defaultSalesperson: null, input: { customer: 'Frame Cut' }, lines: [line({ lineId: '' })] });
    const bytes = await readFile(filePath, 'utf8');
    const revision = job.revision;
    const identity = job.internalJobId;
    const lineIdentity = job.lines[0]?.lineId;
    calculateJ2NonGlassFrameCut(job.lines[0]);
    assert.equal(await readFile(filePath, 'utf8'), bytes, 'calculation does not change repository bytes');
    assert.equal(job.revision, revision);
    assert.equal(job.internalJobId, identity);
    assert.equal(job.lines[0]?.lineId, lineIdentity);
    assert.equal(job.lines[0]?.glassCalc, null, 'persisted glass output is unchanged');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  console.log('Native non-glass frame/cut calculator: PASS');
}

void main();
