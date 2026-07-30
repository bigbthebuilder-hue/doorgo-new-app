import assert from 'node:assert/strict';
import { unifiedJobIdentifier } from './unified-job-identifier';

assert.deepEqual(unifiedJobIdentifier({ bizTrackSalesOrder: 'SO-100', doorGoReference: 'DG-000123', legacyJobId: 'JOB-1234' }),
  { value: 'SO-100', kind: 'sales_order', label: 'Sales Order', displayValue: 'SO-100' });
assert.equal(unifiedJobIdentifier({ doorGoReference: 'DG-000123', legacyJobId: 'JOB-1234' }).kind, 'door_go_reference');
assert.deepEqual(unifiedJobIdentifier({ legacyJobId: 'JOB-1234' }),
  { value: 'JOB-1234', kind: 'legacy_job_id', label: 'Legacy job ID', displayValue: 'JOB-1234' });
assert.throws(() => unifiedJobIdentifier({}), /requires a unified identifier/);
console.log('Unified job identifier contract tests passed');
