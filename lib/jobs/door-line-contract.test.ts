import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  calculateJ2AShopHours,
  defaultDoorLine,
  doorLineEquivalenceKey,
  mergeEquivalentActiveLines,
  normalizeDoorLineInput,
  prepAfterHeightChange,
  prepChoices,
} from './door-line-contract';
import { canReadJobs, canWriteJobs } from './job-intake-contract';
import { createLocalJobIntakeRepository } from './local-job-intake-repository';
import { JobIntakeFailure, type DoorLineInput, type NativeDoorLine } from './job-intake-types';

const actor = 'user-j2';
const lineId1 = '11111111-1111-4111-8111-111111111111';
const lineId2 = '22222222-2222-4222-8222-222222222222';
const lineId3 = '33333333-3333-4333-8333-333333333333';

function validLine(overrides: DoorLineInput = {}): DoorLineInput {
  return { ...defaultDoorLine('Exterior'), lineId: lineId1, lineStatus: 'Active', ...overrides };
}

function failure(code: string) {
  return (error: unknown) => error instanceof JobIntakeFailure && error.code === code;
}

async function main() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'doorgo-j2a-'));
  const filePath = path.join(directory, 'intake.json');
  try {
    const legacyJob = {
      internalJobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', doorGoReference: 'DG-000010', bizTrackSalesOrder: null,
      customer: 'Legacy', siteAddress: null, phone: null, email: null, salesperson: 'Barrett', lifecycleStage: 'Draft',
      notes: null, hingeColor: null, shopHours: null, shopHoursSource: null, fulfillmentPlan: null, deliveryDate: null,
      customerPickupDate: null, shopDate: null, shopDateSource: null, createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z', revision: 4, createdByUserId: actor, updatedByUserId: actor,
    };
    await writeFile(filePath, JSON.stringify({ schemaVersion: 1, nextDoorGoReferenceNumber: 11, jobs: [legacyJob], createCommands: {} }));
    const repository = createLocalJobIntakeRepository({ filePath, enabled: true, runtime: 'test' });
    const compatible = await repository.findById(legacyJob.internalJobId);
    assert.equal(compatible?.revision, 4, 'J1 revision is preserved');
    assert.deepEqual(compatible?.lines, [], 'missing J1 lines become an empty array');
    assert.equal(compatible?.doorGoReference, 'DG-000010');

    const first = await repository.update({
      internalJobId: legacyJob.internalJobId, expectedRevision: 4, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Draft' }, lines: [validLine()],
    });
    assert.equal(first.lines[0].lineId, lineId1, 'line UUID is stable');
    assert.equal(first.revision, 5, 'line save advances aggregate revision');
    assert.equal(first.shopHours, 1, 'Exterior D is 60 minutes');
    assert.equal(first.shopHoursSource, 'Estimated');

    const duplicate = validLine({ ...first.lines[0], lineId: lineId2 });
    const duplicated = await repository.update({
      internalJobId: first.internalJobId, expectedRevision: 5, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Draft' }, lines: [first.lines[0], duplicate],
    });
    assert.notEqual(duplicated.lines[0].lineId, duplicated.lines[1].lineId, 'duplicate has a new UUID');
    const reordered = await repository.update({
      internalJobId: first.internalJobId, expectedRevision: 6, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Draft' }, lines: [duplicated.lines[1], duplicated.lines[0]],
    });
    assert.deepEqual(reordered.lines.map((line) => line.lineId), [lineId2, lineId1], 'reorder preserves identities');
    assert.deepEqual(reordered.lines.map((line) => line.lineIndex), [1, 2], 'line indexes normalize deterministically');

    const archived = await repository.update({
      internalJobId: first.internalJobId, expectedRevision: 7, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Draft' },
      lines: [{ ...reordered.lines[0], lineStatus: 'Archived' }, reordered.lines[1]],
    });
    assert.equal(archived.lines[0].lineId, lineId2, 'archive preserves identity');
    assert.equal(archived.shopHours, 1, 'archived lines are excluded from Shop Hours');
    const restored = await repository.update({
      internalJobId: first.internalJobId, expectedRevision: 8, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Draft' }, lines: [{ ...archived.lines[0], lineStatus: 'Active' }, archived.lines[1]],
    });
    assert.equal(restored.lines[0].lineId, lineId2, 'restore preserves identity');

    await assert.rejects(repository.update({
      internalJobId: first.internalJobId, expectedRevision: 9, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Draft' }, lines: [restored.lines[0]],
    }), failure('validation_failed'), 'omitting a persisted line cannot permanently delete it');

    await assert.rejects(repository.update({
      internalJobId: first.internalJobId, expectedRevision: 9, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Confirmed Job' }, lines: restored.lines.map((line) => ({ ...line, lineStatus: 'Archived' })),
    }), failure('validation_failed'), 'archived lines cannot confirm a job');
    const confirmed = await repository.update({
      internalJobId: first.internalJobId, expectedRevision: 9, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Confirmed Job' }, lines: restored.lines,
    });
    assert.equal(confirmed.lifecycleStage, 'Confirmed Job', 'one valid active line permits confirmation');
    assert.equal((await repository.findById(first.internalJobId))?.lifecycleStage, 'Confirmed Job', 'Confirmed lifecycle persists after save and reopen');
    const draftAgain = await repository.update({
      internalJobId: first.internalJobId, expectedRevision: 10, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Draft' }, lines: confirmed.lines,
    });
    assert.equal(draftAgain.lifecycleStage, 'Draft', 'Confirmed Job can return to Draft');

    const oneActive = await repository.update({
      internalJobId: first.internalJobId, expectedRevision: 11, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Confirmed Job' },
      lines: [draftAgain.lines[0], { ...draftAgain.lines[1], lineStatus: 'Archived' }],
    });
    const beforeFinalArchive = await readFile(filePath, 'utf8');
    await assert.rejects(repository.update({
      internalJobId: first.internalJobId, expectedRevision: 12, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Confirmed Job' }, lines: oneActive.lines.map((line) => ({ ...line, lineStatus: 'Archived' })),
    }), failure('validation_failed'), 'final valid line archive is blocked');
    const afterFinalArchiveRejection = await repository.findById(first.internalJobId);
    assert.equal(await readFile(filePath, 'utf8'), beforeFinalArchive, 'rejected final archive does not change persisted data');
    assert.equal(afterFinalArchiveRejection?.revision, oneActive.revision, 'rejected final archive does not change revision');
    assert.equal(afterFinalArchiveRejection?.internalJobId, oneActive.internalJobId, 'rejected final archive preserves job identity');
    assert.deepEqual(afterFinalArchiveRejection?.lines.map((line) => line.lineId), oneActive.lines.map((line) => line.lineId), 'rejected final archive preserves line identities');
    const beforeInvalid = await readFile(filePath, 'utf8');
    await assert.rejects(repository.update({
      internalJobId: first.internalJobId, expectedRevision: 12, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Confirmed Job' },
      lines: [{ ...oneActive.lines[0], width: '' }, oneActive.lines[1]],
    }), failure('validation_failed'), 'final valid line invalidation is blocked');
    assert.equal(await readFile(filePath, 'utf8'), beforeInvalid, 'invalid aggregate rolls back without a partial write');

    const twoActive = await repository.update({
      internalJobId: first.internalJobId, expectedRevision: 12, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Confirmed Job' },
      lines: [oneActive.lines[0], { ...oneActive.lines[1], lineStatus: 'Active' }],
    });
    const archiveOne = await repository.update({
      internalJobId: first.internalJobId, expectedRevision: 13, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Confirmed Job' },
      lines: [{ ...twoActive.lines[0], lineStatus: 'Archived' }, twoActive.lines[1]],
    });
    assert.equal(archiveOne.lifecycleStage, 'Confirmed Job', 'another valid active line permits archive');

    await assert.rejects(repository.update({
      internalJobId: first.internalJobId, expectedRevision: 13, actorUserId: actor,
      input: { customer: 'Concurrent header' }, lines: twoActive.lines,
    }), failure('stale_revision'), 'header/header stale conflict');
    await assert.rejects(repository.update({
      internalJobId: first.internalJobId, expectedRevision: 13, actorUserId: actor,
      input: { customer: 'Legacy' }, lines: [{ ...twoActive.lines[0], qty: 5 }, twoActive.lines[1]],
    }), failure('stale_revision'), 'header/line and line/line stale conflict');
    await assert.rejects(repository.update({
      internalJobId: first.internalJobId, expectedRevision: 13, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Draft' }, lines: [...twoActive.lines].reverse(),
    }), failure('stale_revision'), 'reorder/archive and lifecycle/line stale conflict');

    const interior = normalizeDoorLineInput(validLine({ mode: 'Interior', width: `2'6"`, material: 'fiberglass', jambWidth: `4-9/16"`, hand: 'LH', prep: 'YES', hingeType: 'REG' }));
    assert.equal(interior.ok && interior.value.material, 'wood', 'Interior material is forced to Wood');
    const pkt = normalizeDoorLineInput(validLine({ mode: 'Interior', config: 'PKT', width: `2'6"`, prep: 'Round', material: 'fiberglass', hand: 'LH', jambWidth: `4-9/16"`, jambType: 'Primed', hingeType: 'REG' }));
    assert.equal(pkt.ok && pkt.value.prep, 'Round Weiser');
    if (pkt.ok) assert.deepEqual([pkt.value.hand, pkt.value.jambWidth, pkt.value.jambType, pkt.value.hingeType], [null, null, null, null]);
    assert.deepEqual(prepChoices('Interior', 'PKT'), ['Round Weiser', 'Reg Emtek', 'LRG Emtek']);
    assert.equal(prepAfterHeightChange('Exterior', 'D', 'STD', `8'0"`), 'MULTI', 'overheight Exterior doors default to multipoint prep');
    assert.equal(prepAfterHeightChange('Exterior', 'SD', 'SINGLE', `6'8"`), 'SINGLE', 'a compatible prep remains selected');
    assert.equal(prepAfterHeightChange('Exterior', 'T/DS', 'MULTI', `6'8"`), 'MULTI', 'returning to standard height preserves a still-valid prep');
    const bp = normalizeDoorLineInput(validLine({ mode: 'Interior', config: 'B.P.', width: `2'6"`, prep: 'HALF', material: 'wood', roWidth: '40', roHeight: '80' }));
    assert.equal(bp.ok && bp.value.roWidth, null, 'B.P. excludes F.O. width');
    assert.equal(bp.ok && bp.value.roHeight, '80', 'B.P. preserves cutting F.O. height');
    const j2bPartial = normalizeDoorLineInput(validLine({ config: 'SD' }));
    assert.equal(j2bPartial.ok && j2bPartial.value.glassCalcStatus, 'Glass Detail Needed', 'J2B glass configs are now save-valid when detail is incomplete');
    assert.equal(normalizeDoorLineInput(validLine({ customSlab: 'WoodCustom', material: 'wood', customSlabWidth: '', customSlabHeight: '80' })).ok, false);
    assert.equal(normalizeDoorLineInput(validLine({ ripJamb: 'Yes', jambWidth: 'RIP' })).ok, false);

    const hours = calculateJ2AShopHours([
      validLine({ qty: 2, prep: 'MULTI', customSlab: 'RO', ripJamb: 'Yes', jambWidth: '5-1/2' }),
      validLine({ lineId: lineId2, mode: 'Interior', config: 'DD', width: `2'6"`, material: 'wood', prep: 'BOTH', hand: '', jambWidth: `4-9/16"`, hingeType: 'REG', qty: 1 }),
      validLine({ lineId: lineId3, lineStatus: 'Archived', qty: 99 }),
    ]);
    assert.equal(hours.shopHours, 5.5, 'quantity and MULTI/custom-RO/RIP additions match deployed minutes');

    const timestamp = '2026-07-20T00:00:00.000Z';
    const full = (input: DoorLineInput): NativeDoorLine => ({
      ...(normalizeDoorLineInput(input).ok ? (normalizeDoorLineInput(input) as { ok: true; value: Omit<NativeDoorLine, 'lineId' | 'lineIndex' | 'lineStatus' | 'createdAt' | 'updatedAt' | 'createdByUserId' | 'updatedByUserId'> }).value : (() => { throw new Error('fixture'); })()),
      lineId: String(input.lineId), lineIndex: Number(input.lineIndex ?? 1), lineStatus: 'Active', createdAt: timestamp, updatedAt: timestamp, createdByUserId: actor, updatedByUserId: actor,
    });
    const mergeA = full(validLine({ lineIndex: 1, qty: 2 }));
    const mergeB = full(validLine({ lineId: lineId2, lineIndex: 2, qty: 3 }));
    assert.equal(doorLineEquivalenceKey(mergeA), doorLineEquivalenceKey(mergeB));
    const merged = mergeEquivalentActiveLines([mergeA, mergeB]);
    assert.equal(merged.lines[0].qty, 5);
    assert.equal(merged.lines[0].lineId, lineId1, 'first identity is kept deterministically');
    assert.equal(merged.lines[1].lineStatus, 'Merged', 'merged-away identity is retained with a hidden status');
    assert.equal(merged.lines.filter((line) => line.lineStatus === 'Active').length, 1);
    assert.equal(merged.lines.filter((line) => line.lineStatus === 'Archived').length, 0, 'merged-away lines are absent from Archived Lines');
    assert.equal(calculateJ2AShopHours([mergeA, mergeB]).shopHours, calculateJ2AShopHours(merged.lines).shopHours, 'merge leaves Shop Hours unchanged');

    const preMergeLines = archiveOne.lines.map((line) => ({ ...line, lineStatus: 'Active' as const }));
    const preMergeHours = calculateJ2AShopHours(preMergeLines).shopHours;
    const persistedMerge = mergeEquivalentActiveLines(preMergeLines);
    const savedMerge = await repository.update({
      internalJobId: first.internalJobId, expectedRevision: archiveOne.revision, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Confirmed Job' }, lines: persistedMerge.lines,
    });
    const reopenedMerge = await repository.findById(first.internalJobId);
    assert.equal(reopenedMerge?.lines.filter((line) => line.lineStatus === 'Active').length, 1, 'reopen preserves one active merged line');
    assert.equal(reopenedMerge?.lines.filter((line) => line.lineStatus === 'Archived').length, 0, 'reopen does not expose merged-away lines as archived');
    assert.equal(reopenedMerge?.lines.find((line) => line.lineStatus === 'Active')?.qty, 2, 'reopen preserves the combined quantity');
    assert.equal(reopenedMerge?.shopHours, preMergeHours, 'persisted merge leaves Shop Hours unchanged');
    await assert.rejects(repository.update({
      internalJobId: first.internalJobId, expectedRevision: savedMerge.revision, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Confirmed Job' },
      lines: savedMerge.lines.map((line) => line.lineStatus === 'Merged' ? { ...line, lineStatus: 'Active' } : line),
    }), failure('validation_failed'), 'merged-away lines cannot be restored');

    const draftForFinalArchive = await repository.update({
      internalJobId: first.internalJobId, expectedRevision: savedMerge.revision, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Draft' }, lines: savedMerge.lines,
    });
    const allArchivedDraft = await repository.update({
      internalJobId: first.internalJobId, expectedRevision: draftForFinalArchive.revision, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Draft' },
      lines: draftForFinalArchive.lines.map((line) => line.lineStatus === 'Active' ? { ...line, lineStatus: 'Archived' } : line),
    });
    assert.equal(allArchivedDraft.lines.filter((line) => line.lineStatus === 'Active').length, 0, 'returning to Draft allows the final active line to be archived');
    const restoredDraft = await repository.update({
      internalJobId: first.internalJobId, expectedRevision: allArchivedDraft.revision, actorUserId: actor,
      input: { customer: 'Legacy', lifecycleStage: 'Draft' },
      lines: allArchivedDraft.lines.map((line) => line.lineStatus === 'Archived' ? { ...line, lineStatus: 'Active' } : line),
    });
    assert.equal(restoredDraft.lines.filter((line) => line.lineStatus === 'Active').length, 1, 'intentionally archived lines remain restorable');

    assert.equal(canReadJobs('view'), true); assert.equal(canWriteJobs('view'), false); assert.equal(canWriteJobs('use'), true);
    const disabled = createLocalJobIntakeRepository({ filePath, enabled: false, runtime: 'test' });
    await assert.rejects(disabled.list(), failure('local_intake_disabled'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log('J2A door-line aggregate contract: PASS');
}

void main();
