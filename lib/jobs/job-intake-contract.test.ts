import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getPermissionAccess, resolveCurrentDoorGoAccess } from '../auth/access';
import {
  canReadJobs,
  canWriteJobs,
  normalizeJobHeaderInput,
  visibleJobIdentifier,
} from './job-intake-contract';
import { createLocalJobIntakeRepository } from './local-job-intake-repository';
import { JobIntakeFailure } from './job-intake-types';

const uuids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
];

function assertFailureCode(error: unknown, code: string): boolean {
  return error instanceof JobIntakeFailure && error.code === code;
}

async function main() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'doorgo-j1-'));
  const filePath = path.join(directory, 'native-job-intake-j1.json');
  let uuidIndex = 0;
  let clock = 0;
  const repository = createLocalJobIntakeRepository({
    filePath,
    enabled: true,
    runtime: 'test',
    uuid: () => uuids[uuidIndex++],
    now: () => new Date(`2026-07-20T10:00:0${clock++}.000Z`),
  });

  try {
    const customerOnly = await repository.create({
      commandId: 'create-customer', actorUserId: 'user-1', defaultSalesperson: '  Alex  ',
      input: { customer: '  Acme Doors  ' },
    });
    assert.equal(customerOnly.customer, 'Acme Doors', 'draft saves with customer only');
    assert.equal(customerOnly.siteAddress, null);
    assert.equal(customerOnly.bizTrackSalesOrder, null, 'Sales Order is not required');
    assert.equal(customerOnly.lifecycleStage, 'Draft');
    assert.equal(customerOnly.salesperson, 'Alex', 'profile display name becomes a snapshot');
    assert.equal(customerOnly.doorGoReference, 'DG-000001');
    assert.equal(visibleJobIdentifier(customerOnly), 'DG-000001');

    const siteOnly = await repository.create({
      commandId: 'create-site', actorUserId: 'user-1', defaultSalesperson: null,
      input: { siteAddress: '  123 Main St  ', email: ' PERSON@EXAMPLE.COM ' },
    });
    assert.equal(siteOnly.siteAddress, '123 Main St', 'draft saves with site only');
    assert.equal(siteOnly.customer, null);
    assert.equal(siteOnly.email, 'person@example.com');
    assert.equal(siteOnly.salesperson, null, 'salesperson is optional');
    assert.equal(siteOnly.doorGoReference, 'DG-000002');

    await assert.rejects(
      repository.create({ commandId: 'blank', actorUserId: 'user-1', defaultSalesperson: null, input: {} }),
      (error) => assertFailureCode(error, 'validation_failed'),
      'customer and site cannot both be blank',
    );
    assert.equal(normalizeJobHeaderInput({ customer: 'A', email: 'bad address' }).ok, false);
    assert.equal(normalizeJobHeaderInput({ customer: 'A', lifecycleStage: 'Confirmed Job' }).ok, true, 'J2 accepts the lifecycle value; aggregate validation enforces the active-line gate');

    const identity = customerOnly.internalJobId;
    const reference = customerOnly.doorGoReference;
    const reassigned = await repository.update({
      internalJobId: identity, expectedRevision: 1, actorUserId: 'user-2',
      input: { customer: 'Acme Doors', salesperson: 'Morgan', bizTrackSalesOrder: ' BT-100 ' },
    });
    assert.equal(reassigned.salesperson, 'Morgan', 'jobs use can save a reassigned snapshot');
    assert.equal(reassigned.bizTrackSalesOrder, 'BT-100');
    assert.equal(visibleJobIdentifier(reassigned), 'BT-100', 'BizTrack replaces the visible identifier');
    assert.equal(reassigned.internalJobId, identity, 'BizTrack edits preserve internal identity');
    assert.equal(reassigned.doorGoReference, reference, 'BizTrack edits preserve DoorGo reference');
    assert.equal(reassigned.revision, 2);

    await assert.rejects(
      repository.update({ internalJobId: identity, expectedRevision: 1, actorUserId: 'user-2', input: { customer: 'Stale' } }),
      (error) => assertFailureCode(error, 'stale_revision'),
      'stale revisions are rejected',
    );
    await assert.rejects(
      repository.update({ internalJobId: siteOnly.internalJobId, expectedRevision: 1, actorUserId: 'user-2', input: { siteAddress: '123 Main', bizTrackSalesOrder: 'bt-100' } }),
      (error) => assertFailureCode(error, 'duplicate_biztrack_sales_order'),
      'non-empty BizTrack values are unique',
    );

    const retried = await repository.create({
      commandId: 'create-site', actorUserId: 'user-1', defaultSalesperson: null,
      input: { siteAddress: '  123 Main St  ', email: ' PERSON@EXAMPLE.COM ' },
    });
    assert.equal(retried.internalJobId, siteOnly.internalJobId, 'create retry returns the original job');
    assert.equal((await repository.list()).length, 2, 'create retry does not add a job');

    const concurrent = await Promise.all([
      repository.create({ commandId: 'concurrent-1', actorUserId: 'user-1', defaultSalesperson: null, input: { customer: 'One' } }),
      repository.create({ commandId: 'concurrent-2', actorUserId: 'user-1', defaultSalesperson: null, input: { customer: 'Two' } }),
    ]);
    assert.deepEqual(concurrent.map((job) => job.doorGoReference), ['DG-000003', 'DG-000004']);
    const stored = JSON.parse(await readFile(filePath, 'utf8')) as { jobs: unknown[]; nextDoorGoReferenceNumber: number };
    assert.equal(stored.jobs.length, 4, 'serialized atomic writes retain both jobs');
    assert.equal(stored.nextDoorGoReferenceNumber, 5);
    assert.deepEqual((await readdir(directory)).filter((name) => name.endsWith('.tmp')), [], 'atomic rename leaves no temporary file');

    const managerWithoutJobs = resolveCurrentDoorGoAccess({
      user: { id: 'manager' },
      profile: { user_id: 'manager', display_name: 'Manager', active: true, is_manager: true, company_location: null, must_change_password: false },
      permissionRows: [{ permission_key: 'jobs', access_level: 'none' }],
    });
    assert.equal(getPermissionAccess(managerWithoutJobs, 'jobs'), 'none', 'manager has no jobs fallback');
    assert.equal(canReadJobs('none'), false);
    assert.equal(canReadJobs('view'), true);
    assert.equal(canReadJobs('use'), true);
    assert.equal(canWriteJobs('none'), false);
    assert.equal(canWriteJobs('view'), false);
    assert.equal(canWriteJobs('use'), true);

    const productionRepository = createLocalJobIntakeRepository({ filePath, enabled: true, runtime: 'production' });
    await assert.rejects(productionRepository.list(), (error) => assertFailureCode(error, 'local_intake_disabled'));
    const disabledRepository = createLocalJobIntakeRepository({ filePath, enabled: false, runtime: 'test' });
    await assert.rejects(disabledRepository.list(), (error) => assertFailureCode(error, 'local_intake_disabled'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  console.log('J1 job intake contract: PASS');
}

void main();
