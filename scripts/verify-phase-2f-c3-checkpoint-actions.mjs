import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const paths = {
  contract: 'lib/production-flow/checkpoint-action-contract.ts',
  service: 'lib/production-flow/checkpoint-service.ts',
  actions: 'lib/production-flow/checkpoint-actions.ts',
  tests: 'lib/production-flow/checkpoint-action-contract.test.ts',
  docs: 'docs/production-flow-checkpoint-actions-contract.md',
};
for (const path of Object.values(paths)) assert.ok(existsSync(path), `Missing C3 file: ${path}`);
const contract = readFileSync(paths.contract, 'utf8');
const service = readFileSync(paths.service, 'utf8');
const actions = readFileSync(paths.actions, 'utf8');
const tests = readFileSync(paths.tests, 'utf8');
const docs = readFileSync(paths.docs, 'utf8');
const executable = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const contractCode = executable(contract); const serviceCode = executable(service); const actionCode = executable(actions);
assert.match(serviceCode, /^import 'server-only';/);
assert.match(serviceCode, /createAuthenticatedSupabaseServerClient/);
assert.match(serviceCode, /supabase\.auth\.getUser\(\)/);
assert.doesNotMatch(serviceCode, /getSession\(/);
assert.match(serviceCode, /supabase\.rpc\(name, parameters\)/);
assert.match(contractCode, /return await executeCheckpointOperation\(operation, request, await createClient\(\)\)/);
assert.doesNotMatch(serviceCode, /return\s+(?:result\.)?data\b/);
assert.match(actionCode, /^'use server';/);
for (const name of ['confirmProductionFlowCheckpoint', 'reviseProductionFlowCheckpoint', 'removeProductionFlowCheckpoint']) assert.match(actionCode, new RegExp(`export async function ${name}\\(`));
assert.doesNotMatch(actionCode, /supabase|\.rpc\(|\.from\(|redirect\(|revalidatePath|revalidateTag/);
for (const [operation, rpc] of Object.entries({ confirm: 'create_production_flow_checkpoint', revise: 'revise_production_flow_checkpoint', remove: 'void_production_flow_checkpoint' })) assert.match(contractCode, new RegExp(`${operation}: ['"]${rpc}['"]`));
const exactParameters = {
  confirm: ['p_checkpoint_id', 'p_production_date', 'p_opening_carry_hours', 'p_calculated_opening_carry_snapshot', 'p_calculation_version', 'p_note'],
  revise: ['p_new_checkpoint_id', 'p_production_date', 'p_expected_checkpoint_id', 'p_expected_revision_number', 'p_opening_carry_hours', 'p_calculated_opening_carry_snapshot', 'p_calculation_version', 'p_note'],
  remove: ['p_void_checkpoint_id', 'p_production_date', 'p_expected_checkpoint_id', 'p_expected_revision_number', 'p_note'],
};
for (const [operation, parameters] of Object.entries(exactParameters)) {
  const marker = operation === 'confirm' ? "operation === 'confirm'" : operation === 'revise' ? "operation === 'revise'" : ': { p_void_checkpoint_id';
  const start = contractCode.indexOf(marker, contractCode.indexOf('const parameters ='));
  const end = operation === 'confirm' ? contractCode.indexOf("operation === 'revise'", start) : operation === 'revise' ? contractCode.indexOf(': { p_void_checkpoint_id', start) : contractCode.indexOf(';', start);
  const block = contractCode.slice(start, end);
  const actualParameters = [...new Set(block.match(/\bp_[a-z_]+\b/g) ?? [])].sort();
  assert.deepEqual(actualParameters, [...parameters].sort(), `${operation} must map exactly its approved RPC parameters`);
}
assert.match(contractCode, /normalizeCheckpointResponse\(result\.data\)/);
assert.match(contractCode, /checkpoint\.checkpointId === value\.commandId/);
assert.match(contractCode, /commandId/);
assert.doesNotMatch(contractCode + serviceCode + actionCode, /gen_random_uuid|randomUUID|uuidv4/);
const forbiddenTrustedClient = new RegExp(`trusted-read-server|${['service', 'role'].join('[_-]?')}|admin\\.|SUPABASE_${['SERVICE', 'ROLE', 'KEY'].join('_')}`, 'i');
assert.doesNotMatch(serviceCode + actionCode, forbiddenTrustedClient);
assert.doesNotMatch(serviceCode + actionCode, /\.from\(['"]dg_production_flow_checkpoints['"]\)|insert\(|update\(|delete\(|upsert\(/);
assert.doesNotMatch(contractCode + serviceCode + actionCode, /permission_key|is_manager|production_checkpoints|permission_key\s*=\s*['"]production['"]/i);
for (const code of ['authentication_required', 'active_profile_required', 'permission_required', 'invalid_request', 'future_date_not_allowed', 'invalid_carry_value', 'too_many_decimal_places', 'note_required', 'note_too_long', 'command_uuid_collision', 'already_confirmed', 'not_found', 'stale_revision', 'inconsistent_history']) assert.match(contract, new RegExp(`['"]${code}['"]`));
assert.match(contract, /checkpointId:[\s\S]*checkpointSeriesId:[\s\S]*productionDate:/);
assert.doesNotMatch(contract, /recordedByUserId|confirmedByUserId|recorded_by_user_id|confirmed_by_user_id/);
assert.match(tests, /future business date remains database-authoritative and unchanged/);
assert.match(docs, /no UI/i);

const normalizePath = (path) => path.replaceAll('\\', '/').replace(/^\.\//, '');
const repositoryPaths = new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean).map(normalizePath));
const mainPaths = new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', 'main'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).map(normalizePath));
const diffPaths = new Set(execFileSync('git', ['diff', '--name-only', 'main', '--'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean).map(normalizePath));
const changed = [...repositoryPaths].filter((path) => diffPaths.has(path) || !mainPaths.has(path));
const approvedLaterMigrations = new Set([
  'supabase/migrations/20260713000000_create_production_flow_checkpoint_read_rpcs.sql',
  'supabase/migrations/20260714000000_create_production_booking_move_contract.sql',
  'supabase/migrations/20260715000000_extend_production_booking_reschedule_contract.sql',
]);
assert.deepEqual(changed.filter((path) => path.startsWith('supabase/migrations/') && !approvedLaterMigrations.has(path)), [], 'Only exact reviewed later-phase migrations may follow C3');
const approvedLaterUi = new Set([
  'app/account/page.tsx',
  'app/production-checkpoints/page.tsx',
  'app/production-checkpoints/checkpoint-operation-forms.tsx',
  'app/production-recovery/page.tsx',
  'app/production-recovery/production-recovery-list.tsx',
  'app/production-board/page.tsx',
  'app/production-schedule/page.tsx',
  'components/ProductionBoardSummary.tsx',
  'components/ProductionBoardView.tsx',
  'components/ProductionBoardReadOnly.tsx',
]);
assert.deepEqual(changed.filter((path) => /^(app|components)\//.test(path) && !approvedLaterUi.has(path)), [], 'Only the exact reviewed C4 UI paths may follow C3');
assert.deepEqual(changed.filter((path) => path.startsWith('lib/production-board/')), [], 'Public Production Board implementation must remain unchanged');
assert.deepEqual(changed.filter((path) => /calendar/i.test(path)), [], 'C3 must not change Calendar behavior');

const sourcePaths = [...repositoryPaths].filter((path) => existsSync(path) && /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path) && !path.startsWith('node_modules/') && !path.startsWith('.next/') && !path.startsWith('scripts/') && !path.endsWith('.test.ts'));
const approvedBoundary = new Set([paths.contract, paths.service, paths.actions]);
for (const path of sourcePaths) {
  const code = executable(readFileSync(path, 'utf8'));
  if (!approvedBoundary.has(path)) assert.doesNotMatch(code, /(?:create|revise|void)_production_flow_checkpoint/, `Unauthorized checkpoint RPC caller in ${path}`);
  assert.doesNotMatch(code, /\.from\(['"]dg_production_flow_checkpoints['"]\)[\s\S]{0,400}\.(?:insert|update|upsert|delete)\(/, `Direct checkpoint mutation in ${path}`);
}

console.log('Phase 2F-C3 checkpoint actions static contract verification passed');
