import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultDoorLine, mergeEquivalentActiveLines } from './door-line-contract';
import { applyManualGeometryOverride, calculateGlassGeometry } from './glass-geometry-contract';
import { createLocalJobIntakeRepository } from './local-job-intake-repository';
import { JobIntakeFailure, type DoorLineInput } from './job-intake-types';

const actor = 'j2b-user';
const jobId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const firstLineId = '11111111-1111-4111-8111-111111111111';
const secondLineId = '22222222-2222-4222-8222-222222222222';

function glassLine(overrides: DoorLineInput = {}): DoorLineInput {
  return {
    ...defaultDoorLine('Exterior'), lineId: firstLineId, lineStatus: 'Active', config: 'SD', width: `3'0"`, height: `6'8"`,
    material: 'fiberglass', roWidth: '', sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG', ...overrides,
  };
}

async function main() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'doorgo-j2b1-'));
  const filePath = path.join(directory, 'intake.json');
  try {
    const legacy = {
      internalJobId: jobId, doorGoReference: 'DG-000001', bizTrackSalesOrder: null, customer: 'Legacy J2A', siteAddress: null,
      phone: null, email: null, salesperson: 'Barrett', lifecycleStage: 'Draft', notes: null, hingeColor: null,
      shopHours: 1, shopHoursSource: 'Estimated', fulfillmentPlan: null, deliveryDate: null, customerPickupDate: null,
      shopDate: null, shopDateSource: null, createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z',
      revision: 4, createdByUserId: actor, updatedByUserId: actor,
      lines: [{ ...defaultDoorLine('Exterior'), lineId: firstLineId, lineIndex: 1, lineStatus: 'Active', createdAt: '2026-07-20T00:00:00.000Z', updatedAt: '2026-07-20T00:00:00.000Z', createdByUserId: actor, updatedByUserId: actor }],
    };
    await writeFile(filePath, JSON.stringify({ schemaVersion: 2, nextDoorGoReferenceNumber: 2, jobs: [legacy], createCommands: {} }));
    const repository = createLocalJobIntakeRepository({ filePath, enabled: true, runtime: 'test', now: () => new Date('2026-07-21T12:00:00.000Z') });
    const loadedLegacy = await repository.findById(jobId);
    assert.equal(loadedLegacy?.internalJobId, jobId); assert.equal(loadedLegacy?.revision, 4); assert.equal(loadedLegacy?.lines[0].lineId, firstLineId);

    const partial = await repository.update({ internalJobId: jobId, expectedRevision: 4, actorUserId: actor, input: { customer: 'Legacy J2A', lifecycleStage: 'Draft' }, lines: [glassLine()] });
    assert.equal(partial.lines[0].glassCalcStatus, 'Glass Detail Needed');
    assert.equal(partial.lines[0].lineId, firstLineId);
    assert.equal(partial.shopHours, 3, 'known SD base remains estimated while glass detail is incomplete');
    const reopenedPartial = await repository.findById(jobId);
    assert.deepEqual(reopenedPartial?.lines[0], partial.lines[0], 'partial state survives reopen exactly');

    const archived = await repository.update({ internalJobId: jobId, expectedRevision: 5, actorUserId: actor, input: { customer: 'Legacy J2A', lifecycleStage: 'Draft' }, lines: [{ ...partial.lines[0], lineStatus: 'Archived' }] });
    assert.equal(archived.shopHours, null); assert.equal(archived.lines[0].glassCalcStatus, 'Glass Detail Needed');
    const restored = await repository.update({ internalJobId: jobId, expectedRevision: 6, actorUserId: actor, input: { customer: 'Legacy J2A', lifecycleStage: 'Draft' }, lines: [{ ...archived.lines[0], lineStatus: 'Active' }] });
    assert.equal(restored.lines[0].lineId, firstLineId); assert.equal(restored.lines[0].glassCalcStatus, 'Glass Detail Needed');

    const duplicate = await repository.update({ internalJobId: jobId, expectedRevision: 7, actorUserId: actor, input: { customer: 'Legacy J2A', lifecycleStage: 'Draft' }, lines: [restored.lines[0], { ...restored.lines[0], lineId: secondLineId }] });
    assert.equal(duplicate.lines[1].glassCalcStatus, 'Glass Detail Needed'); assert.notEqual(duplicate.lines[0].lineId, duplicate.lines[1].lineId);
    const merged = mergeEquivalentActiveLines(duplicate.lines);
    const mergedSaved = await repository.update({ internalJobId: jobId, expectedRevision: 8, actorUserId: actor, input: { customer: 'Legacy J2A', lifecycleStage: 'Draft' }, lines: merged.lines });
    assert.equal(mergedSaved.lines.filter((entry) => entry.lineStatus === 'Merged').length, 1);
    assert.equal((await repository.findById(jobId))?.lines.find((entry) => entry.lineStatus === 'Merged')?.lineId, secondLineId);

    const beforeInvalid = await readFile(filePath, 'utf8');
    await assert.rejects(repository.update({ internalJobId: jobId, expectedRevision: 9, actorUserId: actor, input: { customer: 'Legacy J2A', lifecycleStage: 'Draft' }, lines: mergedSaved.lines.map((entry) => entry.lineStatus === 'Active' ? { ...entry, roWidth: `1'0"` } : entry) }), (error: unknown) => error instanceof JobIntakeFailure && error.code === 'validation_failed');
    assert.equal(await readFile(filePath, 'utf8'), beforeInvalid, 'invalid J2B aggregate rolls back atomically');
    assert.equal((await repository.findById(jobId))?.revision, 9, 'rejected write does not advance aggregate revision');

    const warningInput = glassLine({ lineId: undefined, roWidth: `5'0"`, roHeight: `7'0"` });
    const warningJob = await repository.create({ commandId: 'warning-job', actorUserId: actor, defaultSalesperson: 'Barrett', input: { customer: 'Override audit', lifecycleStage: 'Draft' }, lines: [warningInput] });
    assert.equal(warningJob.lines[0].glassCalcStatus, 'Warning');
    const calculated = calculateGlassGeometry(warningJob.lines[0]);
    const approval = applyManualGeometryOverride({ line: warningJob.lines[0], accessLevel: 'use', acceptedValues: calculated.glassCalc ?? {}, reason: 'Verified site opening', actorUserId: actor, appliedAt: '2026-07-21T12:00:00.000Z' });
    const approved = await repository.update({ internalJobId: warningJob.internalJobId, expectedRevision: 1, actorUserId: actor, input: { customer: 'Override audit', lifecycleStage: 'Draft' }, lines: [{ ...warningJob.lines[0], glassOverride: approval }] });
    assert.equal(approved.lines[0].glassCalcStatus, 'Manual Override');
    const unrelated = await repository.update({ internalJobId: approved.internalJobId, expectedRevision: 2, actorUserId: actor, input: { customer: 'Override audit', lifecycleStage: 'Draft' }, lines: [{ ...approved.lines[0], notes: 'Nongeometry note' }] });
    assert.equal(unrelated.lines[0].glassCalcStatus, 'Manual Override', 'unrelated edit preserves approval');
    const invalidated = await repository.update({ internalJobId: unrelated.internalJobId, expectedRevision: 3, actorUserId: actor, input: { customer: 'Override audit', lifecycleStage: 'Draft' }, lines: [{ ...unrelated.lines[0], roWidth: `5'1"` }] });
    assert.equal(invalidated.lines[0].glassOverride, null, 'geometry edit clears approval at repository boundary');
    assert.equal(invalidated.lines[0].glassCalcStatus, 'Warning');
    const duplicatedApproval = await repository.update({ internalJobId: invalidated.internalJobId, expectedRevision: 4, actorUserId: actor, input: { customer: 'Override audit', lifecycleStage: 'Draft' }, lines: [invalidated.lines[0], { ...approved.lines[0], lineId: secondLineId }] });
    assert.equal(duplicatedApproval.lines[1].glassOverride, null, 'duplicate does not inherit original approval actor/timestamp');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log('J2B1 local aggregate persistence: PASS');
}

void main();
