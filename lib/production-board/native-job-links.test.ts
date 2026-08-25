import assert from 'node:assert/strict';
import { loadCalendarNativeJobLinks, loadNativeJobLinksByVisibleIdentifier } from './native-job-links';
import type { JobIntakeRepository, NativeJobListItem, NativeJobListRequest } from '../jobs/job-intake-types';

const item = (internalJobId: string, visibleIdentifier: string, updatedAt: string, bizTrackSalesOrder: string | null = null): NativeJobListItem => ({
  internalJobId,
  doorGoReference: visibleIdentifier,
  bizTrackSalesOrder,
  visibleIdentifier,
  visibleIdentifierKind: 'door_go_reference',
  legacyJobId: null,
  customer: null,
  siteAddress: null,
  lifecycleStage: 'Confirmed Job',
  createdAt: updatedAt,
  updatedAt,
  revision: 1,
  archivedAt: null,
  activeLineCount: 1,
  archivedLineCount: 0,
});

const firstCursor = { updatedAt: '2026-08-20T10:00:00.000Z', internalJobId: '11111111-1111-4111-8111-111111111111' };
const calls: NativeJobListRequest[] = [];
const repository = {
  async listPage(request: NativeJobListRequest = {}) {
    calls.push(request);
    if (!request.cursor) return {
      items: [item(firstCursor.internalJobId, 'SO-OTHER', firstCursor.updatedAt)],
      page: { limit: 100, hasMore: true, nextCursor: firstCursor },
    };
    return {
      items: [item('22222222-2222-4222-8222-222222222222', 'SO-TARGET', '2026-08-19T10:00:00.000Z', '1234567')],
      page: { limit: 100, hasMore: false, nextCursor: null },
    };
  },
} as JobIntakeRepository;

async function main() {
  const links = await loadNativeJobLinksByVisibleIdentifier(['SO-TARGET'], repository);
  assert.deepEqual(links.get('SO-TARGET'), {
    internalJobId: '22222222-2222-4222-8222-222222222222',
    salesOrder: '1234567',
    customer: null,
  });
  assert.equal(calls.length, 2, 'Native-job enrichment must follow the authoritative RPC pagination');
  assert.deepEqual(calls[1]?.cursor, firstCursor);

  let emptyCalls = 0;
  const emptyRepository = { listPage: async () => { emptyCalls += 1; throw new Error('unexpected'); } } as unknown as JobIntakeRepository;
  assert.equal((await loadNativeJobLinksByVisibleIdentifier([], emptyRepository)).size, 0);
  assert.equal(emptyCalls, 0, 'Users without Jobs enrichment must not invoke the native-job read path');

  calls.length = 0;
  const batched = await loadCalendarNativeJobLinks([], ['22222222-2222-4222-8222-222222222222'], repository);
  assert.equal(batched.byInternalJobId.get('22222222-2222-4222-8222-222222222222')?.salesOrder, '1234567');
  assert.equal(calls.length, 2, 'Internal and visible Calendar identity enrichment shares bounded list pagination, never per-card aggregate RPCs');

  console.log('Production Board native-job link tests passed');
}

void main();
