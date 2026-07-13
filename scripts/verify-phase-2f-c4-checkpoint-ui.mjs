import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const paths = {
  page: 'app/production-checkpoints/page.tsx', form: 'app/production-checkpoints/checkpoint-operation-forms.tsx',
  read: 'lib/production-flow/checkpoint-read-service.ts', carry: 'lib/production-flow/calculated-carry-server.ts',
  contract: 'lib/production-flow/checkpoint-page-contract.ts', tests: 'lib/production-flow/checkpoint-page-contract.test.ts',
  account: 'app/account/page.tsx', board: 'app/production-board/page.tsx', docs: 'docs/production-flow-checkpoint-read-contract.md',
  c4aMigration: 'supabase/migrations/20260713000000_create_production_flow_checkpoint_read_rpcs.sql',
  c4aVerifier: 'scripts/verify-phase-2f-c4a-checkpoint-read-contract.mjs', packageJson: 'package.json',
};
for (const path of Object.values(paths)) assert.ok(existsSync(path), `Missing C4 file: ${path}`);
const read = (path) => readFileSync(path, 'utf8');
const page = read(paths.page); const form = read(paths.form); const service = read(paths.read); const carry = read(paths.carry); const contract = read(paths.contract); const tests = read(paths.tests); const account = read(paths.account);
assert.match(page, /requireDoorGoProtectedAccess\(\)/);
assert.match(page, /hasAtLeastView\(access, 'production_checkpoints'\)/);
assert.ok(page.indexOf("hasAtLeastView(access, 'production_checkpoints')") < page.indexOf('loadAuthorizedCheckpointReads(access'), 'Permission must precede reads');
assert.ok(page.indexOf("hasAtLeastView(access, 'production_checkpoints')") < page.indexOf('loadAuthorizedTodayCalculatedCarry(access'), 'Permission must precede trusted carry loading');
assert.match(account, /hasAtLeastView\(access, 'production_checkpoints'\)[\s\S]*\/production-checkpoints/);
assert.match(account, /key === 'production_checkpoints' \? 'Production checkpoints' : key/);
assert.doesNotMatch(page, /isManager|is_manager|permission[^\n]*['"]production['"]/);
assert.match(service, /^import 'server-only';/); assert.match(carry, /^import 'server-only';/);
assert.match(service, /createAuthenticatedSupabaseServerClient/);
for (const rpc of ['read_production_flow_checkpoint_day', 'read_recent_production_flow_checkpoint_history']) assert.match(service, new RegExp(rpc));
assert.doesNotMatch(service, /trusted-read-server|createTrustedReadOnlySupabaseClient|\.from\(['"]dg_production_flow_checkpoints/);
assert.match(carry, /loadProductionBoardReadOnly/); assert.match(carry, /calculatedCarryHours/);
assert.doesNotMatch(carry, /return\s+board\b|bookings|capacityRows|jobRows/);
assert.doesNotMatch(form, /supabase|\.rpc\(|\.from\s*\(\s*['"]/i);
for (const action of ['confirmProductionFlowCheckpoint', 'reviseProductionFlowCheckpoint', 'removeProductionFlowCheckpoint']) assert.match(form, new RegExp(action));
for (const name of ['Confirm checkpoint', 'Revise checkpoint', 'Remove checkpoint', 'Reconfirm checkpoint']) assert.match(form, new RegExp(name));
assert.match(page, /Removed/);
assert.match(page, />View date<\/button>/);
assert.match(form, /Enter the unfinished shop hours, using up to two decimal places\./);
assert.equal((form.match(/Checkpoint saved\./g) ?? []).length, 1, 'Success copy must have one source');
assert.match(form, /feedback\?\.kind === 'success'[\s\S]*aria-live="polite"/);
assert.match(form, /useState<[^>]+>\(null\)/, 'A clean render must not contain stale success feedback');
assert.match(contract, /checkpointHistoryStatusLabel[\s\S]*'Removed'[\s\S]*'Confirmed'[\s\S]*'Previous version'/);
assert.doesNotMatch(page, />\s*Revised\s*</);
assert.doesNotMatch(page + form, />\s*(?:Void|Voided|Superseded)\b/i);
assert.doesNotMatch(page + form, />\s*(?:Void|Voided|Supabase|RPC|Database|Mutation|Command UUID|Checkpoint UUID)\b/i);
assert.match(contract, /America\/Vancouver/); assert.match(page, /max=\{today\}/); assert.match(contract, /value > today/);
assert.match(contract, /selectedDate === params\.today[\s\S]*liveCarry/); assert.match(contract, /revisions\[0\]\?\.calculatedOpeningCarryHours \?\? null/);
assert.match(contract, /actual === null \|\| calculated === null \? null : actual - calculated/);
assert.match(page, /operations\.length \? <CheckpointOperationForms/); assert.match(contract, /if \(access !== 'use'\) return \[\]/);
assert.match(contract, /submittedFingerprint === fingerprint[\s\S]*commandId: state\.commandId/);
assert.match(page, /RECENT_CHECKPOINT_HISTORY_LIMIT/); assert.match(contract, /RECENT_CHECKPOINT_HISTORY_LIMIT = 20/);
assert.doesNotMatch(page, /checkpointId\s*\}\s*<\//, 'Internal checkpoint identifier must not be rendered as text');
assert.match(tests, /getCheckpointOperations\('none'/); assert.match(tests, /getCheckpointOperations\('view'/); assert.match(tests, /getCheckpointOperations\('use'/);
assert.match(tests, /stale_revision/); assert.match(tests, /commandForSubmission/);
assert.match(tests, /checkpointHistoryStatusLabel/);

const board = read(paths.board);
assert.match(board, /loadProductionBoardReadOnly/);
assert.doesNotMatch(board, /requireDoorGoProtectedAccess|getCurrentDoorGoAccess|redirect\(['"]\/login/);
const packageJson = JSON.parse(read(paths.packageJson));
assert.match(packageJson.scripts['verify:phase-2f-c4a-checkpoint-read-contract'], /verify-phase-2f-c4a-checkpoint-read-contract\.mjs/);
const migrationFiles = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .map((name) => `supabase/migrations/${name}`);
const duplicateReadContracts = migrationFiles.filter((path) => path !== paths.c4aMigration && /read_production_flow_checkpoint_day|read_recent_production_flow_checkpoint_history/.test(read(path)));
assert.deepEqual(duplicateReadContracts, [], 'A second checkpoint read migration contract is forbidden');
assert.match(read('.gitignore'), /supabase\/\.temp\//);
console.log('Phase 2F-C4 checkpoint UI static contract verification passed');
