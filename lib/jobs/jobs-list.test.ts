import assert from 'node:assert/strict';
import { normalizeJobHeaderInput } from './job-intake-contract';
import { defaultJobSalesperson, jobSalespeople, organizedJobs } from './jobs-list';
import type { NativeJobListItem } from './job-intake-types';

const job = (id: string, order: string | null, salesperson: string | null, isComplete = false): NativeJobListItem => ({
  internalJobId: id, doorGoReference: 'DG-' + id, bizTrackSalesOrder: order, customer: 'Customer ' + id,
  siteAddress: 'Site ' + id, salesperson, isComplete, lifecycleStage: 'Confirmed Job', createdAt: '2026-11-01T12:00:00Z',
  updatedAt: '2026-11-01T12:00:00Z', revision: 1, activeLineCount: 1, archivedLineCount: 0, archivedAt: null,
});
const jobs = [job('a', '9', 'Aaron'), job('b', '100', 'Barrett'), job('c', '999', 'Aaron', true),
  job('d', null, null, false), job('e', '10', ' aaron '), job('f', '0010', 'Barrett', true)];
assert.deepEqual(jobSalespeople(jobs), ['Aaron', 'Barrett']);
assert.equal(defaultJobSalesperson(jobs, ' AARON '), 'Aaron');
assert.equal(defaultJobSalesperson(jobs, 'Administrator'), '', 'an administrator without matching assignments starts with All');
assert.equal(defaultJobSalesperson(jobs, ''), '');
assert.deepEqual(organizedJobs(jobs, '', 'Aaron').map(job => job.internalJobId), ['e', 'a', 'c']);
assert.deepEqual(organizedJobs(jobs, '', '').map(job => job.internalJobId), ['b', 'e', 'a', 'd', 'c', 'f']);
for (const search of ['Customer b', 'Site b', '100']) {
  assert.deepEqual(organizedJobs(jobs, search, 'Aaron').map(job => job.internalJobId), ['b'], 'search crosses salesperson selection');
}
assert.deepEqual(organizedJobs(jobs, 'Customer', 'Aaron').map(job => job.internalJobId), ['b', 'e', 'a', 'd', 'c', 'f']);
const changed = jobs.map(job => job.internalJobId === 'b' ? { ...job, isComplete: true } : job);
assert.deepEqual(organizedJobs(changed, '', '').map(job => job.internalJobId), ['e', 'a', 'd', 'c', 'b', 'f']);
assert.deepEqual(organizedJobs([job('big1','9007199254740993','Aaron'), job('big2','9007199254740992','Aaron')], '', '').map(job => job.internalJobId), ['big1','big2']);
assert.equal(normalizeJobHeaderInput({customer:'Test',salesperson:''}).ok, true, 'existing unassigned jobs stay valid');
console.log('Jobs defaults, cross-salesperson search, grouping, numeric SO ordering and automatic completion grouping passed.');
