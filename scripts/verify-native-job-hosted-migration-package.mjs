import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260728000000_create_native_job_persistence.sql');
const preflight = read('scripts/inspect-native-job-hosted-preflight.sql');
const application = read('scripts/verify-native-job-hosted-application.sql');
const rollback = read('scripts/rollback-native-job-persistence.sql');
const runbook = read('docs/hosted-native-job-migration-runbook.md');
const checksum = createHash('sha256').update(migration).digest('hex').toUpperCase();
assert.equal(checksum, '2F13B297F395440912F6CD0B40FCD636DF6A23DD6331B4454DDA867258763B05');
assert.ok(runbook.includes(checksum), 'Runbook must record the exact migration checksum');

const stripComments = (sql) => sql.replace(/--.*$/gm, '');
const preflightCode = stripComments(preflight).toLowerCase();
assert.match(preflightCode.trim(), /^with\b/);
assert.doesNotMatch(preflightCode, /\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|call|do|begin|commit|rollback|lock|set)\b/,
  'Preflight must remain SELECT-only');
assert.equal((preflightCode.match(/;\s*$/g) ?? []).length, 1, 'Preflight must be one statement');
for (const required of ['planned_relation_collisions','planned_rpc_collisions','planned_constraint_index_collisions',
  'dg_sequence_floor','required_extensions','required_roles','profile_permission_assumptions','legacy_mirror_schema',
  'legacy_mirror_counts','operational_baseline_counts','operational_schema_marker']) assert.ok(preflight.includes(required));
assert.match(preflight,/highest_valid_suffix[\s\S]*candidate_unoccupied[\s\S]*runtime_collision_skipping_required/);

const appCode = stripComments(application).toLowerCase();
assert.match(application,/PORTION 1:[\s\S]*PORTION 2:/);
assert.match(appCode,/with[\s\S]*begin;[\s\S]*do \$acceptance\$[\s\S]*rollback;/i);
assert.match(appCode,/fail_closed_security_summary[\s\S]*all_tables_rls_enabled[\s\S]*no_table_forced_rls[\s\S]*policy_count[\s\S]*forbidden_direct_table_grant_count[\s\S]*unexpected_rpc_grant_count[\s\S]*authenticated_rpc_grant_count/);
assert.doesNotMatch(appCode,/\bcommit\b/,'Behavioral script must never commit');
assert.equal((appCode.match(/\bbegin;/g)??[]).length,1);
assert.equal((appCode.match(/\brollback;/g)??[]).length,1);
for (const signature of [
  'dg_create_native_job\',\'p_command_id uuid, p_origin text, p_legacy_job_id text, p_legacy_identifier_kind text, p_header jsonb, p_lines jsonb',
  'dg_update_native_job\',\'p_internal_job_id uuid, p_expected_revision bigint, p_header jsonb, p_lines jsonb',
  'dg_archive_native_job\',\'p_internal_job_id uuid, p_expected_revision bigint, p_reason text',
  'dg_get_native_job\',\'p_internal_job_id uuid, p_include_archived boolean',
  'dg_list_native_jobs\',\'p_include_archived boolean, p_limit integer, p_cursor_updated_at timestamp with time zone, p_cursor_internal_job_id uuid',
]) assert.ok(appCode.includes(signature),`Missing exact signature ${signature}`);
for (const evidence of ['idempotent_replay','idempotency_conflict','duplicate_door_go_reference','duplicate_sales_order',
  'stale_revision','line_status=\'archived\'','jobs_view_write_not_denied','inactive_not_denied',
  'manager_fallback_or_jobs_none_not_denied','partial_cursor_not_rejected','limit_not_rejected',
  'archived_default_exclusion_failed','prohibited_data_mutation_detected']) assert.ok(appCode.includes(evidence),`Missing behavioral evidence ${evidence}`);
assert.match(appCode,/set_config\('request\.jwt\.claim\.sub'[\s\S]*set_config\('request\.jwt\.claim\.role'/);
assert.doesNotMatch(appCode,/(?:insert into|update|delete from) public\.dg_job(?:s|_lines)\b/,'Legacy writes are forbidden');
assert.doesNotMatch(appCode,/(?:insert into|update|delete from) public\.(?:dg_production|dg_calendar|dg_daily_capacity|dg_fulfillment|dg_document|dg_email)/,
  'Operational writes are forbidden');

const rollbackCode = stripComments(rollback).toLowerCase();
assert.match(rollbackCode,/^\s*begin;[\s\S]*commit;\s*$/);
const droppedFunctions = [...rollbackCode.matchAll(/drop function public\.([a-z0-9_]+)\(([^)]*)\);/g)].map((m)=>`${m[1]}(${m[2]})`);
assert.deepEqual(droppedFunctions,[
  'dg_create_native_job(uuid,text,text,text,jsonb,jsonb)','dg_update_native_job(uuid,bigint,jsonb,jsonb)',
  'dg_archive_native_job(uuid,bigint,text)','dg_get_native_job(uuid,boolean)',
  'dg_list_native_jobs(boolean,integer,timestamptz,uuid)',
]);
assert.deepEqual([...rollbackCode.matchAll(/drop table public\.([a-z0-9_]+);/g)].map((m)=>m[1]),
  ['dg_native_job_create_commands','dg_native_job_lines','dg_native_jobs']);
assert.deepEqual([...rollbackCode.matchAll(/drop sequence public\.([a-z0-9_]+);/g)].map((m)=>m[1]),['dg_native_job_reference_seq']);
assert.doesNotMatch(rollbackCode,/dg_jobs|dg_job_lines|production|calendar|capacity|fulfillment|document|email|auth\./,
  'Rollback scope must contain only new native objects');

for (const text of [preflight,application,rollback,runbook]) {
  assert.doesNotMatch(text,/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,'No email address may be embedded');
  const privilegedKeyPattern = new RegExp(`${['service','role'].join('_')}|${['resend','api','key'].join('_')}|eyJ[A-Za-z0-9_-]+\\.`, 'i');
  assert.doesNotMatch(text,privilegedKeyPattern,'No secret material may be embedded');
}
assert.match(runbook,/sequence allocation is nontransactional[\s\S]*permanently consumes DG sequence values/i);
assert.match(runbook,/Download CSV[\s\S]*Copy as JSON/);
console.log('Native-job hosted migration acceptance package verification passed');
