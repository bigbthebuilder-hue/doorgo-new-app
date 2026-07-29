import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const form = readFileSync('components/jobs/JobHeaderForm.tsx', 'utf8');
const control = readFileSync('components/jobs/JobArchiveControl.tsx', 'utf8');
const lines = readFileSync('components/jobs/DoorLineWorkspace.tsx', 'utf8');

assert.match(form, /archiveDraftJobAction/, 'editor must use the existing archive server action');
assert.match(form, /target=\{jobArchiveTarget\(job, canEdit\)\}/, 'visibility must use the saved native-job target contract');
assert.match(control, /onArchive\(\{ internalJobId: target!\.internalJobId, expectedRevision: target!\.revision, reason: archiveReason \}\)/, 'archive request must use immutable ID, current saved revision, and reason');
assert.match(control, /onNavigate\('\/jobs'\)/, 'successful archive must return to the default Jobs list');
assert.doesNotMatch(control, /createDraftJobAction|updateDraftJobAction|persistAggregate|\bsave\(/, 'archive control must not save unrelated editor changes or use another persistence path');
assert.match(lines, />Archive \/ Remove<\/button>/, 'line-level archive control must remain present and independent');

console.log('Native job archive UI static verification passed');
