import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260728000000_create_native_job_persistence.sql');
const correctiveMigration = read('supabase/migrations/20260729000000_harden_native_job_service_role_grants.sql');
const updateExpressionCorrection = read('supabase/migrations/20260729010000_fix_native_job_update_greatest.sql');
const preflight = read('scripts/inspect-native-job-hosted-preflight.sql');
const application = read('scripts/verify-native-job-hosted-application.sql');
const rollback = read('scripts/rollback-native-job-persistence.sql');
const runbook = read('docs/hosted-native-job-migration-runbook.md');
const checksum = createHash('sha256').update(migration).digest('hex').toUpperCase();
assert.equal(checksum, '2F13B297F395440912F6CD0B40FCD636DF6A23DD6331B4454DDA867258763B05');
assert.ok(runbook.includes(checksum), 'Runbook must record the exact migration checksum');

const stripComments = (sql) => sql.replace(/--.*$/gm, '');
const extractUpdateSetColumns = (functionDefinition, relation) => {
  const escapedRelation = relation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const setClause = functionDefinition.match(
    new RegExp(`\\bupdate\\s+${escapedRelation}\\b(?:\\s+as\\s+[a-z_][a-z0-9_]*)?\\s+set\\s+([\\s\\S]*?)\\s+where\\b`, 'i'),
  )?.[1];
  assert.ok(setClause, `Expected one inspectable UPDATE ${relation} SET clause`);
  return [...setClause.matchAll(/(?:^|,)\s*([a-z_][a-z0-9_]*)\s*=/gim)]
    .map((match) => match[1]).sort();
};

const archiveAnalysisRegressionFixture = `
  select profile.user_id
  from public.dg_user_profiles as profile
  join public.dg_permissions as permission on permission.user_id = profile.user_id
  where profile.user_id = p_internal_job_id
  for update;
  update public.dg_native_jobs as job
  set archived_at = now(),
      archived_by_user_id = auth.uid(),
      archive_reason = p_reason,
      updated_at = now(),
      updated_by_user_id = auth.uid(),
      revision = job.revision + 1
  where job.internal_job_id = p_internal_job_id
  returning job.internal_job_id, job.revision;
`;
assert.deepEqual(extractUpdateSetColumns(archiveAnalysisRegressionFixture, 'public.dg_native_jobs'), [
  'archive_reason', 'archived_at', 'archived_by_user_id', 'revision', 'updated_at', 'updated_by_user_id',
], 'Function analysis must extract assignments only from the DML SET clause');
const archiveFunction = migration.match(
  /create or replace function public\.dg_archive_native_job\([\s\S]*?\n\$\$;/i,
)?.[0];
assert.ok(archiveFunction, 'Exact archive RPC definition must be inspectable');
assert.deepEqual(extractUpdateSetColumns(archiveFunction, 'public.dg_native_jobs'), [
  'archive_reason', 'archived_at', 'archived_by_user_id', 'revision', 'updated_at', 'updated_by_user_id',
], 'Archive RPC must update only the accepted archive and audit columns');
const serviceRole = ['service', 'role'].join('_');
const correctiveStatements = stripComments(correctiveMigration).split(';')
  .map((statement) => statement.replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean);
assert.deepEqual(correctiveStatements, [
  'begin',
  `revoke all on table public.dg_native_jobs from ${serviceRole}`,
  `revoke all on table public.dg_native_job_lines from ${serviceRole}`,
  `revoke all on table public.dg_native_job_create_commands from ${serviceRole}`,
  `revoke all on sequence public.dg_native_job_reference_seq from ${serviceRole}`,
  `revoke execute on function public.dg_create_native_job(uuid,text,text,text,jsonb,jsonb) from ${serviceRole}`,
  `revoke execute on function public.dg_update_native_job(uuid,bigint,jsonb,jsonb) from ${serviceRole}`,
  `revoke execute on function public.dg_archive_native_job(uuid,bigint,text) from ${serviceRole}`,
  `revoke execute on function public.dg_get_native_job(uuid,boolean) from ${serviceRole}`,
  `revoke execute on function public.dg_list_native_jobs(boolean,integer,timestamptz,uuid) from ${serviceRole}`,
  'commit',
], 'Corrective migration must contain only the exact transaction and native-object revocations');
const correctiveCode = stripComments(correctiveMigration).toLowerCase();
assert.doesNotMatch(correctiveCode, /\b(create|alter|drop|insert|update|delete|merge|truncate|grant|select|call|do|set|lock)\b/,
  'Corrective migration must not change structure, data, function bodies, sequence values, or grants');
assert.doesNotMatch(correctiveCode, /\b(nextval|setval|create\s+or\s+replace\s+function)\b/,
  'Corrective migration must not consume the sequence or replace an RPC body');
for (const signature of [
  'dg_create_native_job(uuid,text,text,text,jsonb,jsonb)',
  'dg_update_native_job(uuid,bigint,jsonb,jsonb)',
  'dg_archive_native_job(uuid,bigint,text)',
  'dg_get_native_job(uuid,boolean)',
  'dg_list_native_jobs(boolean,integer,timestamptz,uuid)',
]) assert.ok(migration.toLowerCase().includes(`grant execute on function public.${signature} to authenticated`),
  `Authenticated EXECUTE grant must remain intact for ${signature}`);

const updateFunctionPattern = /create or replace function public\.dg_update_native_job\([\s\S]*?\n\$\$;/i;
const originalUpdateFunction = migration.match(updateFunctionPattern)?.[0];
const correctedUpdateFunction = updateExpressionCorrection.match(updateFunctionPattern)?.[0];
assert.ok(originalUpdateFunction && correctedUpdateFunction, 'Exact update RPC definitions must be inspectable');
assert.equal(
  correctedUpdateFunction,
  originalUpdateFunction.replace('pg_catalog.greatest(', 'GREATEST('),
  'Corrective update RPC must differ only by the valid GREATEST expression',
);
const updateCorrectionCode = stripComments(updateExpressionCorrection).toLowerCase();
assert.match(updateCorrectionCode.trim(), /^begin;[\s\S]*create or replace function public\.dg_update_native_job\([\s\S]*\$\$;[\s\S]*commit;$/);
assert.doesNotMatch(updateCorrectionCode, /\b(alter table|create table|drop|truncate|grant|revoke|nextval|setval)\b/,
  'Update correction must not change other objects, grants, or sequence state');

const invalidSpecialQualification = /pg_catalog\.(?:greatest|least|coalesce|nullif)\s*\(|pg_catalog\.(?:substring|trim|position|extract|overlay)\s*\([^)]*\b(?:from|in|placing)\b/i;
for (const [name,text] of [
  ['original migration after the known repaired expression',migration.replace('pg_catalog.greatest(', 'GREATEST(')],
  ['grant correction',correctiveMigration],
  ['update correction',updateExpressionCorrection],
  ['hosted acceptance SQL',application],
]) assert.doesNotMatch(text,invalidSpecialQualification,`${name} contains invalid schema-qualified special syntax`);
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
assert.match(appCode,/fail_closed_security_summary[\s\S]*all_rpc_owners_postgres[\s\S]*update_function_contract_passed[\s\S]*forbidden_direct_table_grant_count[\s\S]*authenticated_rpc_grant_count[\s\S]*postgres_owner_rpc_grant_count[\s\S]*service_role_rpc_grant_count[\s\S]*rpc_grant_contract_passed[\s\S]*forbidden_direct_sequence_grant_count[\s\S]*native_sequence_grants[\s\S]*update_function_evidence/);
assert.match(appCode,/pg_get_userbyid\(p\.proowner\) as owner/,
  'Permanent verification must report direct owner evidence for native RPCs');
assert.match(appCode,/pg_get_functiondef\(p\.oid\)[\s\S]*function_definition_md5[\s\S]*contains_valid_greatest[\s\S]*contains_invalid_pg_catalog_greatest/,
  'Permanent verification must report concise corrected update-function evidence');
assert.match(appCode,/owner='postgres' and prosecdef=true and configuration='search_path=""'[\s\S]*contains_valid_greatest=true and contains_invalid_pg_catalog_greatest=false/,
  'Permanent verification must require the corrected update-function contract');
assert.match(appCode,/native_runtime_counts[\s\S]*count\(\*\)[\s\S]*from public\.dg_native_jobs[\s\S]*from public\.dg_native_job_lines[\s\S]*from public\.dg_native_job_create_commands/,
  'Permanent verification must report exact native runtime row counts');
assert.match(appCode,/native_sequence_runtime[\s\S]*last_value[\s\S]*is_called[\s\S]*calculated_next_candidate_value[\s\S]*configured_start_value[\s\S]*increment_by[\s\S]*cache_size[\s\S]*cycle_enabled/,
  'Permanent verification must report sequence runtime and configuration evidence');
assert.match(appCode,/native_runtime_tables_empty[\s\S]*native_sequence_not_reset[\s\S]*native_sequence_advancement_compatible[\s\S]*final_hosted_acceptance_runtime_state_passed/,
  'Permanent verification must fail closed on final runtime state');
assert.match(appCode,/configured_start_value=7 and increment_by=1 and last_value>=configured_start_value\+increment_by[\s\S]*is_called=true/,
  'Sequence acceptance must permit gaps while proving at least two allocations above the floor');
assert.match(appCode,/16,'native_runtime_counts'[\s\S]*17,'native_sequence_runtime'/,
  'Permanent verification must export both runtime evidence sections');
assert.match(appCode,/grantee in \('public','anon','authenticated','service_role'\)/,
  'Direct table and sequence access must fail closed for every non-owner role');
assert.match(appCode,/grantee='postgres'[\s\S]*privilege_type='execute'[\s\S]*\)=5/,
  'Normal postgres owner routine privileges must be expected explicitly');
assert.match(appCode,/grantee='service_role'[\s\S]*rpc_grant_contract_passed/,
  'Service-role native RPC execution must be reported and rejected');
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
assert.doesNotMatch(appCode,/dg-000007/,'Behavioral acceptance must not assume a literal next reference');
for (const evidence of ['v_sequence_position','created_reference_format_failed','created_reference_allocation_failed',
  "v_reference !~ '^dg-[0-9]{6}$'",'v_reference_suffix<=v_sequence_position','state.last_value','legacy.job_id=v_reference'])
  assert.ok(appCode.includes(evidence),`Missing sequence-safe behavioral evidence ${evidence}`);
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

for (const text of [preflight,application,rollback,runbook,correctiveMigration,updateExpressionCorrection]) {
  assert.doesNotMatch(text,/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,'No email address may be embedded');
  const privilegedKeyPattern = new RegExp(`${['resend','api','key'].join('_')}|eyJ[A-Za-z0-9_-]+\\.`, 'i');
  assert.doesNotMatch(text,privilegedKeyPattern,'No secret material may be embedded');
}
assert.match(runbook,/sequence allocation is nontransactional[\s\S]*permanently consumes DG sequence values/i);
assert.match(runbook,/Download CSV[\s\S]*Copy as JSON/);
console.log('Native-job hosted migration acceptance package verification passed');
