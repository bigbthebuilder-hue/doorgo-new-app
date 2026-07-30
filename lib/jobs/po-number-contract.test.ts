import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getPermissionAccess, resolveCurrentDoorGoAccess } from '../auth/access';
import { canReadJobs, canWriteJobs, jobAggregateDirtySnapshot, normalizeJobHeaderInput, normalizePoNumbers, visibleJobIdentifier } from './job-intake-contract';
import { createLocalJobIntakeRepository } from './local-job-intake-repository';
import { JobIntakeFailure } from './job-intake-types';

const ids = [
  '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444',
];

function failureCode(error: unknown, code: string): boolean {
  return error instanceof JobIntakeFailure && error.code === code;
}

async function main() {
  assert.deepEqual(normalizePoNumbers(undefined), { ok: true, value: [] });
  assert.deepEqual(normalizePoNumbers([]), { ok: true, value: [] });
  assert.deepEqual(normalizePoNumbers([' 123 ', '', '456', '123', '  ']), { ok: true, value: ['123', '456'] });
  assert.deepEqual(normalizePoNumbers(['12A']), { ok: false, message: 'PO Numbers must contain digits only.' });
  const invalidHeader = normalizeJobHeaderInput({ customer: 'A', poNumbers: ['12-3'] });
  assert.equal(invalidHeader.ok, false);
  assert.equal(invalidHeader.ok ? '' : invalidHeader.fieldErrors.poNumbers, 'PO Numbers must contain digits only.');

  const directory = await mkdtemp(path.join(os.tmpdir(), 'doorgo-po-'));
  const filePath = path.join(directory, 'store.json');
  let uuid = 0;
  let second = 0;
  const repository = createLocalJobIntakeRepository({
    filePath, enabled: true, runtime: 'test', uuid: () => ids[uuid++],
    now: () => new Date(`2026-07-21T12:00:${String(second++).padStart(2, '0')}.000Z`),
  });

  try {
    const zero = await repository.create({ commandId: 'zero', actorUserId: 'user', defaultSalesperson: null, input: { customer: 'Zero' } });
    assert.deepEqual(zero.poNumbers, []);
    const one = await repository.create({ commandId: 'one', actorUserId: 'user', defaultSalesperson: null, input: { customer: 'One', poNumbers: [' 1001 '] } });
    assert.deepEqual(one.poNumbers, ['1001']);
    const multiple = await repository.create({ commandId: 'multiple', actorUserId: 'user', defaultSalesperson: null, input: { customer: 'Multiple', poNumbers: ['300', '100', '', '300', '200'] } });
    assert.deepEqual(multiple.poNumbers, ['300', '100', '200'], 'saved order is first-entered order, without blanks or duplicates');
    assert.deepEqual((await repository.findById(multiple.internalJobId))?.poNumbers, ['300', '100', '200'], 'save and reopen retains POs');

    const identity = multiple.internalJobId;
    const reference = multiple.doorGoReference;
    const updated = await repository.update({ internalJobId: identity, expectedRevision: 1, actorUserId: 'user', input: { customer: 'Multiple', bizTrackSalesOrder: 'BT-9', poNumbers: ['100', '200'] } });
    assert.deepEqual(updated.poNumbers, ['100', '200'], 'removal persists on update');
    assert.equal(updated.internalJobId, identity);
    assert.equal(updated.doorGoReference, reference);
    assert.equal(updated.bizTrackSalesOrder, 'BT-9');
    assert.equal(visibleJobIdentifier(updated), 'BT-9', 'PO values do not affect visible identity precedence');
    assert.deepEqual(updated.lines, multiple.lines, 'PO update does not alter lines');
    assert.equal(updated.lifecycleStage, multiple.lifecycleStage, 'PO update does not alter lifecycle');
    assert.deepEqual((await repository.findById(identity))?.poNumbers, ['100', '200'], 'removal survives reopen');

    await assert.rejects(repository.update({ internalJobId: identity, expectedRevision: 1, actorUserId: 'user', input: { customer: 'Multiple', poNumbers: [] } }), (error) => failureCode(error, 'stale_revision'));
    const beforeInvalid = await readFile(filePath, 'utf8');
    await assert.rejects(repository.update({ internalJobId: identity, expectedRevision: 2, actorUserId: 'user', input: { customer: 'Multiple', poNumbers: ['BAD'] } }), (error) => failureCode(error, 'validation_failed'));
    assert.equal(await readFile(filePath, 'utf8'), beforeInvalid, 'invalid PO rolls back the complete aggregate write');

    const stored = JSON.parse(beforeInvalid) as { jobs: Array<Record<string, unknown>> };
    const legacy = stored.jobs.find((job) => job.internalJobId === zero.internalJobId);
    assert.ok(legacy);
    delete legacy.poNumbers;
    const legacyBytes = `${JSON.stringify(stored, null, 2)}\n`;
    await writeFile(filePath, legacyBytes, 'utf8');
    const compatible = await repository.findById(zero.internalJobId);
    assert.deepEqual(compatible?.poNumbers, [], 'missing legacy PO field loads as empty');
    assert.equal(compatible?.revision, zero.revision, 'compatibility load preserves revision');
    assert.equal(compatible?.internalJobId, zero.internalJobId);
    assert.equal(await readFile(filePath, 'utf8'), legacyBytes, 'compatibility read does not rewrite repository bytes');
    const explicitSave = await repository.update({ internalJobId: zero.internalJobId, expectedRevision: zero.revision, actorUserId: 'user', input: { customer: 'Zero', poNumbers: ['77'] } });
    assert.deepEqual(explicitSave.poNumbers, ['77']);
    assert.equal(explicitSave.revision, zero.revision + 1, 'only an explicit save advances revision');

    const clean = jobAggregateDirtySnapshot({ values: { poNumbers: ['1'] }, lines: [], lifecycleStage: 'Draft', pendingPoNumber: '' });
    assert.notEqual(jobAggregateDirtySnapshot({ values: { poNumbers: ['1', '2'] }, lines: [], lifecycleStage: 'Draft', pendingPoNumber: '' }), clean, 'PO list changes are dirty');
    assert.notEqual(jobAggregateDirtySnapshot({ values: { poNumbers: ['1'] }, lines: [], lifecycleStage: 'Draft', pendingPoNumber: '2' }), clean, 'pending PO entry is dirty');

    const view = resolveCurrentDoorGoAccess({ user: { id: 'view' }, profile: { user_id: 'view', display_name: 'View', active: true, is_manager: false, company_location: null, must_change_password: false }, permissionRows: [{ permission_key: 'jobs', access_level: 'view' }] });
    const use = resolveCurrentDoorGoAccess({ user: { id: 'use' }, profile: { user_id: 'use', display_name: 'Use', active: true, is_manager: false, company_location: null, must_change_password: false }, permissionRows: [{ permission_key: 'jobs', access_level: 'use' }] });
    const manager = resolveCurrentDoorGoAccess({ user: { id: 'manager' }, profile: { user_id: 'manager', display_name: 'Manager', active: true, is_manager: true, company_location: null, must_change_password: false }, permissionRows: [{ permission_key: 'jobs', access_level: 'none' }] });
    assert.equal(canReadJobs(getPermissionAccess(view, 'jobs')), true, 'jobs=view may inspect POs');
    assert.equal(canWriteJobs(getPermissionAccess(view, 'jobs')), false, 'jobs=view cannot mutate POs');
    assert.equal(canWriteJobs(getPermissionAccess(use, 'jobs')), true, 'jobs=use may mutate POs');
    assert.equal(canReadJobs(getPermissionAccess(manager, 'jobs')), false, 'manager has no permission fallback');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  console.log('Native Job Intake PO persistence: PASS');
}

void main();
