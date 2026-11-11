import assert from 'node:assert/strict';
import { doorLabelValues, jobSpecificationSnapshot, mergeSavedDoorLabels, pendingDoorLabelSaves, retainPendingDoorLabelEdits } from './door-label-save-contract';
import { saveHostedDoorLineLabels } from './hosted-job-intake-repository';
import type { NativeJobAggregate } from './job-intake-types';

async function main() {
  const lineId = '22222222-2222-4222-8222-222222222222';
  const internalJobId = '11111111-1111-4111-8111-111111111111';
  for (const lifecycleStage of ['Draft', 'Confirmed Job'] as const) {
    const job = { internalJobId, revision: 7, lifecycleStage, lines: [{ lineId, doorId: 'Old', productCode: '001_A', qty: 2 }] } as NativeJobAggregate;
    const lines = [{ ...job.lines[0], doorId: '', productCode: ' 00-Ab_9 ' }, { lineId: 'new', doorId: 'New' }];
    const requests = pendingDoorLabelSaves(job, lines);
    assert.equal(requests.length, 1, 'new unsaved lines wait for their initial insert');
    assert.deepEqual(requests[0].changes, {
      doorId: { expected: 'Old', value: null }, productCode: { expected: '001_A', value: ' 00-Ab_9 ' },
    });
    const merged = mergeSavedDoorLabels(job.lines[0], requests[0]);
    assert.equal(merged.doorId, null);
    assert.equal(merged.qty, 2);
    assert.equal(job.revision, 7);
    assert.equal(pendingDoorLabelSaves({ ...job, lines: [merged] }, [merged]).length, 0, 'partial successes are retryable');
    const snapshot = (lines: unknown) => JSON.stringify({ values: { customer: 'Example' }, lines, lifecycleStage });
    assert.equal(jobSpecificationSnapshot(snapshot(job.lines)), jobSpecificationSnapshot(snapshot([merged])));
    assert.notEqual(jobSpecificationSnapshot(snapshot(job.lines)), jobSpecificationSnapshot(snapshot([{ ...merged, qty: 3 }])));
    assert.notEqual(jobSpecificationSnapshot(snapshot(job.lines)), jobSpecificationSnapshot(snapshot(lines)));
    const calls: unknown[] = [];
    await saveHostedDoorLineLabels({ rpc: async (name, args) => { calls.push({ name, args }); return { data: true, error: null }; } }, requests[0]);
    assert.deepEqual(calls, [{ name: 'dg_update_native_door_labels', args: { p_internal_job_id: internalJobId, p_line_id: lineId, p_changes: requests[0].changes } }]);
    await assert.rejects(saveHostedDoorLineLabels({ rpc: async () => ({ data: null, error: { message: 'native_job.stale_labels' } }) }, requests[0]), /another session/);
    await assert.rejects(saveHostedDoorLineLabels({ rpc: async () => { throw Error('must not call'); } }, { ...requests[0], changes: { qty: { expected: null, value: '3' } } } as never), /Invalid door label update/);
  }
  assert.deepEqual(doorLabelValues({}), { doorId: null, productCode: null });
  assert.deepEqual(retainPendingDoorLabelEdits(
    [{ lineId: '1', doorId: 'Server room', productCode: 'REMOTE' }],
    [{ lineId: '1', doorId: 'Old room', productCode: 'OLD' }],
    [{ lineId: '1', doorId: '', productCode: 'OLD' }],
  ), [{ lineId: '1', doorId: null, productCode: 'REMOTE' }], 'retain a local clear typed during a full save while accepting unedited remote values');
  console.log('Door label save contract and adapter tests passed');
}
void main();
