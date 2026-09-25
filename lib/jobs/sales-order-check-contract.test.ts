import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { salesOrderIsDuplicate } from './sales-order-check-contract';
import { createLocalJobIntakeRepository } from './local-job-intake-repository';
import { JobIntakeFailure, type NativeJobListItem } from './job-intake-types';

async function main() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'doorgo-sales-order-'));
  try {
    const repository = createLocalJobIntakeRepository({ filePath: path.join(directory, 'jobs.json'), enabled: true, runtime: 'test' });
    const owner = await repository.create({ commandId: 'owner', actorUserId: 'test', defaultSalesperson: null, input: { customer: 'Owner', bizTrackSalesOrder: ' SO-123 ' } });
    const blank = await repository.create({ commandId: 'blank', actorUserId: 'test', defaultSalesperson: null, input: { customer: 'Blank' } });
    assert.equal(await salesOrderIsDuplicate(repository, 'unused'), false);
    assert.equal(await salesOrderIsDuplicate(repository, '  so-123  '), true);
    assert.equal(await salesOrderIsDuplicate(repository, 'SO-123', owner.internalJobId), false);
    assert.equal(await salesOrderIsDuplicate(repository, 'SO-123', blank.internalJobId), true);
    assert.equal(await salesOrderIsDuplicate(repository, 'unused', blank.internalJobId), false);
    assert.equal(await salesOrderIsDuplicate(repository, '   '), false);
    assert.equal(await salesOrderIsDuplicate(repository, 'SO- 123'), false, 'internal spacing remains significant');
    await assert.rejects(repository.create({ commandId: 'duplicate', actorUserId: 'test', defaultSalesperson: null, input: { customer: 'Duplicate', bizTrackSalesOrder: 'so-123' } }), (e: unknown) => e instanceof JobIntakeFailure && e.code === 'duplicate_biztrack_sales_order');
    await assert.rejects(repository.update({ internalJobId: blank.internalJobId, expectedRevision: blank.revision, actorUserId: 'test', input: { customer: 'Blank', bizTrackSalesOrder: 'SO-123' } }), (e: unknown) => e instanceof JobIntakeFailure && e.code === 'duplicate_biztrack_sales_order');
    await repository.update({ internalJobId: owner.internalJobId, expectedRevision: owner.revision, actorUserId: 'test', input: { customer: 'Owner', bizTrackSalesOrder: 'SO-123' } });

    let pages = 0;
    assert.equal(await salesOrderIsDuplicate({ listPage: async (request) => {
      assert.equal(request?.includeArchived, true);
      pages += 1;
      return request?.cursor
        ? { items: [{ internalJobId: 'archived', bizTrackSalesOrder: 'SO-123' } as NativeJobListItem], page: { limit: 100, hasMore: false, nextCursor: null } }
        : { items: [], page: { limit: 100, hasMore: true, nextCursor: { updatedAt: '2026-01-01', internalJobId: 'cursor' } } };
    } }, 'so-123'), true, 'checks owners beyond the first page, including archived jobs');
    assert.equal(pages, 2);
    console.log('Early Sales Order check and final save protection: PASS');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
void main();
