import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const page = read('app/jobs/import/page.tsx');
const jobs = read('app/jobs/page.tsx');
const review = read('components/jobs/LegacyJobImportReview.tsx');
const form = read('components/jobs/JobHeaderForm.tsx');
const action = read('lib/jobs/job-intake-actions.ts');
const service = read('lib/jobs/job-intake-service.ts');
const hosted = read('lib/jobs/hosted-job-intake-repository.ts');
const local = read('lib/jobs/local-job-intake-repository.ts');
const fixture = read('tests/fixtures/legacy-transfer-job-0065.json');

assert.match(jobs, /href="\/jobs\/import"[^>]*>Import Legacy Job/);
assert.match(page, /canUse\(access, 'jobs'\)[\s\S]*redirect\('\/account'\)/);
assert.match(review, /legacyTransferFilePreflight\(file\)[\s\S]*await file\.text\(\)/, 'file size/type must be checked before parsing');
assert.match(review, /accept="application\/json,\.json"/);
assert.match(form, /No native job, UUID, revision, or new DoorGo reference exists/);
assert.match(form, /Save as Native Job/);
assert.match(form, /router\.replace\(`\/jobs\/\$\{saved\.internalJobId\}\/edit`\)/, 'successful Revision 1 creation must navigate to the normal editor');
assert.match(form, /disabled=\{isPending \|\| Boolean\(transferReview && unresolvedTransferBlockers/, 'immutable blockers must disable Save');
assert.match(form, /The legacy source must be archived manually/);
assert.match(form, /primaryIdentifier\.value/);
assert.doesNotMatch(form, /label="Legacy Job ID"|id="legacyJobId"/, 'no second legacy identifier input is allowed');
assert.match(action, /inspectLegacyTransferAction[\s\S]*mapLegacyTransferToUnsavedEditor/);
assert.match(action, /createTransferredJobAction[\s\S]*createTransferredJobWithAccess/);
assert.doesNotMatch(action.match(/inspectLegacyTransferAction[\s\S]*?\n\}/)?.[0] ?? '', /createJobIntakeRepository|\.create\(|\.rpc\(/, 'inspection and cancellation must not reach persistence');
assert.match(service, /mapLegacyTransferToUnsavedEditor\(request\.rawPayload\)/);
assert.match(service, /transferLineIds\[index\][\s\S]*lineIndex: index \+ 1[\s\S]*lineStatus: 'Active'/);
assert.match(hosted, /async createTransferred[\s\S]*call\('dg_create_transferred_native_job'/);
assert.doesNotMatch(hosted.match(/async createTransferred[\s\S]*?\n    },/)?.[0] ?? '', /dg_create_native_job/);
assert.match(local, /async createTransferred\(\)[\s\S]*local_intake_disabled/, 'local fallback must fail closed');
assert.match(fixture, /"identifier_kind": "legacy_job_id"[\s\S]*"identifier_value": "JOB-0065"/);
for (const forbidden of ['dg_production', 'dg_calendar', 'dg_fulfillment', 'dg_document', 'resend', 'send email']) {
  for (const source of [review, action, service]) assert.ok(!source.toLowerCase().includes(forbidden), `import runtime references prohibited boundary: ${forbidden}`);
}

console.log('Legacy transfer import/review static verification passed');
