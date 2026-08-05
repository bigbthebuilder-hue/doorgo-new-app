import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const stripComments = (sql) => sql.replace(/--.*$/gm, '');
const migration = read('supabase/migrations/20260728000000_create_native_job_persistence.sql');
const correctiveMigration = read('supabase/migrations/20260729000000_harden_native_job_service_role_grants.sql');
const updateExpressionCorrection = read('supabase/migrations/20260729010000_fix_native_job_update_greatest.sql');
const transferAmendment = read('supabase/migrations/20260730000000_add_legacy_transfer_persistence.sql');
const glassSourceMigration = read('supabase/migrations/20260805000000_add_direct_dimension_glass_sources.sql');
const glassSourcePreflight = read('scripts/read-only-direct-dimension-glass-hosted-preflight.sql');
const glassRegexProbe = read('scripts/read-only-direct-dimension-glass-regex-probe.sql');
const glassRpcAcceptance = read('scripts/rollback-contained-direct-dimension-glass-rpc-acceptance.sql');
const glassUpdateCorrection = read('supabase/migrations/20260805010000_fix_direct_dimension_update_rpc_allowlist.sql');
const glassUpdateRollback = read('scripts/rollback-direct-dimension-update-rpc-allowlist.sql');
const glassUpdateMd5Probe = read('scripts/rollback-contained-direct-dimension-update-rpc-md5-probe.sql');
const preflight = read('scripts/inspect-native-job-hosted-preflight.sql');
const application = read('scripts/verify-native-job-hosted-application.sql');
const rollback = read('scripts/rollback-native-job-persistence.sql');
const glassRollback = read('scripts/rollback-direct-dimension-glass-sources.sql');
const runbook = read('docs/hosted-native-job-migration-runbook.md');
const checksum = createHash('sha256').update(migration.replace(/\r\n/g, '\n')).digest('hex').toUpperCase();
const sha256 = (text) => createHash('sha256').update(text).digest('hex').toUpperCase();
assert.equal(sha256(Buffer.from(glassSourceMigration)), 'C0672271E2681DAF67A4EEE74113C00A1B1435131986CA6DEFE666EDD81A7ECF', 'Applied direct-dimension migration must remain byte-identical');
assert.equal(sha256(Buffer.from(glassRollback)), '0A6E96885BE49B2708C9BC5C36FDF9F4E484F8B1F804E1E804063A60E8E82641', 'Feature rollback must remain byte-identical');
const updateDefinition = (sql) => sql.match(/CREATE OR REPLACE FUNCTION public\.dg_update_native_job\([\s\S]*?\n\$function\$;/i)?.[0];
const submittedLineAllowlist = (definition) => definition?.match(/jsonb_array_elements\(p_lines\)[\s\S]*?jsonb_object_keys\(line\)[\s\S]*?ALL\(ARRAY\[([\s\S]*?)\]::text\[\]\)/i)?.[1] ?? '';
const directFields = ['sidelight_specifications','transom_t_bar_size','transom_glass_type_code','transom_custom_glass_description'];
const validateUpdateMd5Probe = (sql) => {
  const code=stripComments(sql);const lower=code.toLowerCase();const definition=updateDefinition(code);assert.ok(definition,'Probe must temporarily replace the update RPC');
  assert.match(lower,/^\s*drop table if exists pg_temp\.[a-z0-9_]+;[\s\S]*create temp table pg_temp\.[a-z0-9_]+[\s\S]*do \$probe\$[\s\S]*exception when others[\s\S]*get stacked diagnostics[\s\S]*if v_error<>\'probe\.candidate_evidence_captured_force_rollback\' then raise[\s\S]*insert into pg_temp\.[a-z0-9_]+[\s\S]*select result_label,candidate_function_md5[\s\S]*overall_probe_passed from pg_temp\.[a-z0-9_]+;\s*$/);
  assert.doesNotMatch(lower,/\bcommit;|1c080e0832feb2821df8248e715f0c96/);
  assert.equal((lower.match(/probe\.candidate_evidence_captured_force_rollback/g)??[]).length,2,'Probe must raise and exclusively handle the forced rollback sentinel');
  assert.equal((lower.match(/create or replace function public\.dg_[a-z0-9_]+/g)??[]).length,1);
  assert.ok(lower.includes('6819aa940c8e894c23601b73e870fd28'),'Probe must require and verify the original hosted MD5');
  for(const field of directFields)assert.ok(submittedLineAllowlist(definition).includes(`'${field}'`),`Probe allowlist missing ${field}`);
  for(const evidence of ['candidate_function_md5','keys_present_in_executable_allowlist_not_only_comments_or_mappings','validator_call_present','all_four_persistence_mappings_present','stale_revision_guard_present','archive_and_merge_behavior_present','revision_increment_present','owner_correct','security_definer_correct','empty_search_path_correct','grants_correct','sequence_unchanged_while_candidate_installed','candidate_contract_passed','restored_function_md5','restored_original_md5','sequence_last_value_unchanged','sequence_is_called_unchanged','overall_probe_passed'])assert.ok(lower.includes(evidence),`Probe missing ${evidence}`);
  assert.ok(lower.lastIndexOf('insert into pg_temp.')>lower.indexOf("v_restored_md5='6819aa940c8e894c23601b73e870fd28'"),'Evidence must be inserted only after restoration is proven');
  assert.equal((lower.match(/insert into pg_temp\./g)??[]).length,1,'Exactly one evidence insertion is allowed after restoration');
  assert.equal((lower.match(/^select result_label,candidate_function_md5.*from pg_temp\.[a-z0-9_]+;$/gm)??[]).length,1,'Final statement must be the one combined result SELECT');
  assert.doesNotMatch(lower.replace(definition.toLowerCase(),''),/\b(?:insert into public\.|update public\.|delete from|nextval|setval|alter sequence|restart sequence|supabase_migrations)|dg_create_native_job\s*\(|dg_create_transferred_native_job\s*\(|dg_archive_native_job\s*\(/);
  assert.doesNotMatch(lower.replace(definition.toLowerCase(),''),/create (?!temp table pg_temp\.)table|insert into public\.|update public\.|delete from public\./);
};
validateUpdateMd5Probe(glassUpdateMd5Probe);
[glassUpdateMd5Probe+'\nCOMMIT;',glassUpdateMd5Probe.replace('candidate_function_md5,all_four_allowlist_keys_present','all_four_allowlist_keys_present'),glassUpdateMd5Probe.replaceAll('pg_temp.doorgo_update_rpc_md5_probe_results','public.doorgo_update_rpc_md5_probe_results'),glassUpdateMd5Probe.replace("IF v_error<>'probe.candidate_evidence_captured_force_rollback' THEN RAISE; END IF;",'NULL;'),glassUpdateMd5Probe.replace("RAISE EXCEPTION 'probe.candidate_evidence_captured_force_rollback';",''),glassUpdateMd5Probe.replace("INSERT INTO pg_temp.doorgo_update_rpc_md5_probe_results VALUES", "INSERT INTO pg_temp.doorgo_update_rpc_md5_probe_results VALUES").replace("v_restored_original:=v_restored_md5", "INSERT INTO pg_temp.doorgo_update_rpc_md5_probe_results DEFAULT VALUES; v_restored_original:=v_restored_md5"),glassUpdateMd5Probe.replace('CREATE TEMP TABLE pg_temp.','CREATE TABLE public.'),glassUpdateMd5Probe.replace('DO $probe$','SELECT nextval(\'x\'); DO $probe$'),glassUpdateMd5Probe.replace('DO $probe$','SELECT public.dg_create_native_job(NULL,NULL,NULL,NULL,NULL,NULL); DO $probe$')].forEach((bad,index)=>assert.throws(()=>validateUpdateMd5Probe(bad),`Combined probe negative ${index}`));
const validateUpdateCorrection = (sql) => {
  const code=stripComments(sql); const lower=code.toLowerCase(); const definition=updateDefinition(code); assert.ok(definition,'Correction must replace the exact update RPC');
  assert.equal((lower.match(/create or replace function public\.dg_[a-z0-9_]+/g)??[]).length,1,'Correction may replace only one RPC');
  assert.match(lower,/^\s*begin;[\s\S]*6819aa940c8e894c23601b73e870fd28[\s\S]*commit;\s*$/);
  for(const field of directFields) assert.ok(submittedLineAllowlist(definition).includes(`'${field}'`),`${field} must be in the executable submitted-line allowlist`);
  for(const token of ['dg_validate_direct_dimension_glass_source','owner to postgres','security definer',"set search_path=''",'from public,anon,service_role','to authenticated','be3117f9494d85c82adb2359bf2040d1']) assert.ok(lower.includes(token),`Correction missing ${token}`);
  assert.ok(lower.includes('if v_job.revision is distinct from p_expected_revision then'), 'Stale-revision behavior must remain present');
  assert.doesNotMatch(lower.replace(definition.toLowerCase(),''),/\b(?:alter table|create table|drop table|insert into|delete from|update public\.|nextval|setval|alter sequence|supabase_migrations)\b/);
};
validateUpdateCorrection(glassUpdateCorrection);
for(const bad of [glassUpdateCorrection.replace("'sidelight_specifications',",''),glassUpdateCorrection.replace("'sidelight_specifications',","/* sidelight_specifications */"),glassUpdateCorrection.replace('CREATE OR REPLACE FUNCTION public.dg_update_native_job','CREATE OR REPLACE FUNCTION public.dg_create_native_job'),glassUpdateCorrection.replace('6819aa940c8e894c23601b73e870fd28','missing'),glassUpdateCorrection.replace('IF v_job.revision IS DISTINCT FROM p_expected_revision THEN','IF false THEN')]) assert.throws(()=>validateUpdateCorrection(bad));
const validateUpdateRollback = (sql) => { const code=stripComments(sql);const lower=code.toLowerCase();const definition=updateDefinition(code);assert.match(lower,/^\s*begin;[\s\S]*1c080e0832feb2821df8248e715f0c96[\s\S]*6819aa940c8e894c23601b73e870fd28[\s\S]*commit;\s*$/);assert.equal((lower.match(/create or replace function public\.dg_[a-z0-9_]+/g)??[]).length,1);assert.ok(definition);assert.doesNotMatch(lower.replace(definition.toLowerCase(),''),/rollback-direct-dimension-glass-sources|rollback-native-job-persistence|\b(?:alter table|drop column|drop constraint|nextval|setval|alter sequence|insert into|delete from)\b/);};
validateUpdateRollback(glassUpdateRollback);
assert.throws(()=>validateUpdateRollback(glassUpdateRollback.replace('6819aa940c8e894c23601b73e870fd28','altered')));
const validateGlassAcceptance=(sql)=>{const x=sql.toLowerCase();assert.match(x,/^-- rollback-contained direct-dimension glass rpc acceptance[\s\S]*\bbegin;[\s\S]*\brollback;[\s\S]*\bselect\b/);assert.doesNotMatch(x,/\bcommit;|pg_catalog\.nextval|\bsetval\b|alter sequence|restart sequence|dg_create_native_job\([^;]*,'native'|dg_archive_native_job|supabase_migrations|dg_production|dg_calendar|dg_fulfillment|dg_email/);for(const a of ['dg_create_native_job(','dg_update_native_job(','dg_create_transferred_native_job(','old_payload_compatibility','stale_revision','idempotency_conflict','test_jobs_remaining','test_lines_remaining','test_command_receipts_remaining','sequence_unchanged','overall_acceptance_passed'])assert.ok(x.includes(a),`Missing acceptance evidence ${a}`);for(const r of ['unsupported_t_bar','numeric_t_bar','duplicate_identity','missing_side','string_index','fractional_index','outside_index','unsupported_width','blank_width','unknown_glass','custom_without_description','invalid_description_scalar','unsupported_panel_mode','unexpected_key','non_array','invalid_transom_tbar','invalid_transom_glass','malformed_native','malformed_transfer'])assert.ok(x.includes(r),`Missing rejection ${r}`);for(const field of directFields)assert.ok(x.includes(field),`Acceptance must exercise ${field}`);assert.match(x,/dg_update_native_job\(v_transfer_job[\s\S]{0,900}'transom_t_bar_size'[\s\S]{0,900}'transom_glass_type_code'[\s\S]{0,900}'transom_custom_glass_description'/);for(const field of ['origin','legacy_job_id','legacy_identifier_kind','visible_identifier','visible_identifier_kind','transfer_source_system','transfer_schema','transfer_version','transfer_source_identifier_kind','transfer_source_identifier_value','transfer_source_saved_at','transfer_exported_at','transfer_source_fingerprint'])assert.ok((x.match(new RegExp(`'${field}'`,'g'))??[]).length>=2,`Acceptance must snapshot and compare ${field}`);assert.match(x,/v_provenance_after is distinct from v_provenance_snapshot/);assert.match(x,/line_status','archived'[\s\S]*validation_failed[\s\S]*archived_transferred_line_not_rejected/);assert.doesNotMatch(x,/raise exception 'malformed_(?:native|transfer)_not_rejected'[\s\S]{0,100}exception when others/);assert.match(x,/v_rejection_observed:=false;[\s\S]*get stacked diagnostics v_error=message_text;[\s\S]*if v_error like '%validation_failed%'[\s\S]*if not v_rejection_observed/);assert.match(x,/v_actor_count<>1/);assert.match(x,/v_after_sequence<>v_seq[\s\S]*v_after_called is distinct from v_seq_called/);assert.doesNotMatch(x,/dg-000013|job-0065/)};validateGlassAcceptance(glassRpcAcceptance);for(const bad of [glassRpcAcceptance.replace('ROLLBACK;','COMMIT;'),glassRpcAcceptance.replace('ROLLBACK;',''),glassRpcAcceptance.replace("'legacy_transfer'","'native'"),glassRpcAcceptance.replace('v_after_sequence<>v_seq','false'),glassRpcAcceptance.replaceAll('public.dg_update_native_job','public.missing_update'),glassRpcAcceptance.replace('old_payload_compatibility','compatibility_removed'),glassRpcAcceptance.replaceAll('test_jobs_remaining','jobs_check_removed'),glassRpcAcceptance.replace('unsupported_t_bar','rejection_removed'),glassRpcAcceptance.replace("'line_status','Archived'","'line_status','Active'")])assert.throws(()=>validateGlassAcceptance(bad));
const validateGlassRollback=(sql)=>{const x=sql.toLowerCase();assert.match(x,/^-- direct-dimension glass narrow rollback[\s\S]*begin;[\s\S]*commit;\s*$/);assert.match(x,/sidelight_specifications is distinct from '\[\]'::jsonb/);for(const g of ['transom_t_bar_size','transom_glass_type_code','transom_custom_glass_description'])assert.match(x,new RegExp('or '+g+' is not null'));for(const f of ['sidelight_specifications','transom_t_bar_size','transom_glass_type_code','transom_custom_glass_description']){assert.ok(x.includes(f));assert.equal((x.match(new RegExp(`drop column ${f}\\b`,'g'))??[]).length,1)}for(const n of ['dg_create_native_job','dg_update_native_job','dg_create_transferred_native_job']){const b=sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${n}\\([\\s\\S]*?\\$function\\$`))?.[0];assert.ok(b);assert.doesNotMatch(b,/sidelight_specifications|transom_t_bar_size|transom_glass_type_code|transom_custom_glass_description|dg_validate_direct_dimension_glass_source/)}assert.ok(x.indexOf('create or replace function public.dg_create_native_job')<x.indexOf('drop column sidelight_specifications'));assert.ok(x.lastIndexOf('drop constraint ')<x.indexOf('drop function public.dg_validate_direct_dimension_glass_source'));assert.doesNotMatch(x,/\b(setval|alter sequence|restart|drop table|truncate|delete from public\.dg_native|update public\.dg_native_jobs set revision=revision|supabase_migrations|rollback-native-job-persistence)\b/);assert.doesNotMatch(x,/drop (?:column|constraint|function) if exists/);assert.doesNotMatch(x,/tokens? truncated|output truncated|omitted for brevity|chars? truncated/i)};validateGlassRollback(glassRollback);for(const bad of [glassRollback.replace("sidelight_specifications IS DISTINCT FROM '[]'::jsonb",'false'),glassRollback.replace('OR transom_t_bar_size IS NOT NULL',''),glassRollback.replace('CREATE OR REPLACE FUNCTION public.dg_update_native_job','CREATE OR REPLACE FUNCTION public.missing_update'),glassRollback.replace('BEGIN;','BEGIN;\nSELECT setval(\'x\',1);'),glassRollback.replace('BEGIN;','BEGIN;\nUPDATE public.dg_native_jobs SET revision=revision;'),glassRollback.replace('BEGIN;','BEGIN;\nDROP TABLE public.dg_native_jobs;')])assert.throws(()=>validateGlassRollback(bad));
assert.equal(checksum, '2F13B297F395440912F6CD0B40FCD636DF6A23DD6331B4454DDA867258763B05');
assert.ok(runbook.includes(checksum), 'Runbook must record the exact migration checksum');
assert.match(transferAmendment,/CREATE FUNCTION public\.dg_create_transferred_native_job\([\s\S]*SECURITY DEFINER SET search_path=''/);
assert.match(transferAmendment,/ALTER FUNCTION public\.dg_create_transferred_native_job\(uuid,jsonb,jsonb,jsonb\) OWNER TO postgres/);
assert.match(transferAmendment,/GRANT EXECUTE ON FUNCTION public\.dg_create_transferred_native_job\(uuid,jsonb,jsonb,jsonb\) TO authenticated/);
assert.doesNotMatch(transferAmendment,/\b(?:ALTER SEQUENCE|setval|RESTART)\b/i);
assert.doesNotMatch(transferAmendment,/(?:INSERT INTO|UPDATE|DELETE FROM) public\.(?:dg_jobs|dg_job_lines|dg_production|dg_calendar|dg_daily_capacity|dg_fulfillment|dg_document|dg_email)/i);
assert.match(glassSourceMigration,/^--[\s\S]*BEGIN;[\s\S]*COMMIT;\s*$/);
for (const field of ['sidelight_specifications','transom_t_bar_size','transom_glass_type_code','transom_custom_glass_description']) assert.ok(glassSourceMigration.includes(field));
for (const rpc of ['dg_create_native_job','dg_update_native_job','dg_create_transferred_native_job']) {
  assert.match(glassSourceMigration,new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}\\(`));
  assert.match(glassSourceMigration,new RegExp(`ALTER FUNCTION public\\.${rpc}\\([^;]+ OWNER TO postgres`));
}
assert.match(glassSourceMigration,/transom_t_bar_size IN \('1\.5','2\.25'\)/);
const finishedWidthRegex = "pg_catalog.btrim(v_specification->>'finishedWidth') !~ '^[0-9[:space:]./''\"′’″“”-]+$'";
assert.ok(glassSourceMigration.includes(finishedWidthRegex));
assert.doesNotMatch(glassSourceMigration,/\$dimensions?\$[^\n]*\+\$\$dimensions?\$/i);
assert.doesNotMatch(glassSourceMigration,/(?:!~\*?|~\*?)\s*\$([a-z_][a-z0-9_]*)\$[^\n]*\+\$\$\1\$/i);
const dollarTags=[...glassSourceMigration.matchAll(/\$[a-z_]*\$/gi)].map(m=>m[0]);
for(const tag of new Set(dollarTags)) assert.equal(dollarTags.filter(value=>value===tag).length%2,0,`Unbalanced dollar quote ${tag}`);
for(const broken of [
  glassSourceMigration.replace(finishedWidthRegex,"pg_catalog.btrim(v_specification->>'finishedWidth') !~ $dimensions$^[0-9]+$$dimensions$"),
  glassSourceMigration.replace("AS $$\nDECLARE","AS $broken$\nDECLARE"),
  glassSourceMigration.replace("-]+$'", "-]+'"),
  glassSourceMigration.replace("-]+$'", "-]*$'"),
]) assert.throws(()=>{const tags=[...broken.matchAll(/\$[a-z_]*\$/gi)].map(m=>m[0]);assert.doesNotMatch(broken,/\$dimensions?\$[^\n]*\+\$\$dimensions?\$/i);for(const tag of new Set(tags))assert.equal(tags.filter(v=>v===tag).length%2,0);assert.ok(broken.includes(finishedWidthRegex));});
assert.ok(glassRegexProbe.includes("~ '^[0-9[:space:]./''\"′’″“”-]+$'"));
const probeCode=glassRegexProbe.replace(/^\s*--.*$/gm,'').replace(/'(?:''|[^'])*'/g,"''");
assert.match(probeCode.trim(),/^WITH\b[\s\S]*\bSELECT\b[\s\S]*;$/i);
assert.doesNotMatch(probeCode,/\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO|LOCK|SET|RESET|nextval|setval)\b/i);
assert.match(glassSourceMigration,/CREATE OR REPLACE FUNCTION public\.dg_validate_direct_dimension_glass_source\(p_line jsonb\)[\s\S]*IMMUTABLE[\s\S]*SECURITY INVOKER[\s\S]*SET search_path = ''/);
assert.match(glassSourceMigration,/ALTER FUNCTION public\.dg_validate_direct_dimension_glass_source\(jsonb\) OWNER TO postgres/);
assert.match(glassSourceMigration,/REVOKE ALL ON FUNCTION public\.dg_validate_direct_dimension_glass_source\(jsonb\) FROM PUBLIC,anon,authenticated,service_role/);
const extractGlassRpc = (source, name) => source.match(
  new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i'),
)?.[0];
const splitSqlList = (source) => {
  const parts = []; let start = 0; let depth = 0; let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "'" && source[index + 1] === "'") { index += 1; continue; }
    if (character === "'") quoted = !quoted;
    else if (!quoted && character === '(') depth += 1;
    else if (!quoted && character === ')') depth -= 1;
    else if (!quoted && depth === 0 && character === ',') { parts.push(source.slice(start,index).trim()); start=index+1; }
  }
  parts.push(source.slice(start).trim()); return parts;
};
const validateNativeCreate = (body) => {
  assert.ok(body, 'Native-create RPC body must be independently extractable');
  assert.doesNotMatch(body, /tokens? truncated|output truncated|omitted for brevity|chars? truncated|Oâ€¦|…\s*\d+\s+tokens?/i);
  assert.doesNotMatch(body, /p_internal_job_id|p_expected_revision|UPDATE public\.dg_native_jobs|submitted_bound|aggregate_bound|\bomitted\s+AS\s*\(|ON CONFLICT \(line_id\) DO UPDATE|stale_revision/i);
  assert.match(body, /v_job_id uuid := extensions\.gen_random_uuid\(\)/);
  assert.equal((body.match(/pg_catalog\.nextval\(/g) ?? []).length,1);
  for (const anchor of [
    'INSERT INTO public.dg_native_jobs','INSERT INTO public.dg_native_job_lines',
    'INSERT INTO public.dg_native_job_create_commands',"'idempotent_replay', true","'idempotent_replay',false",
    'SELECT * INTO v_receipt','v_receipt.request_fingerprint IS DISTINCT FROM v_fingerprint',
    'NOT public.dg_validate_direct_dimension_glass_source(line)',
    'WHERE job.internal_job_id=v_job_id',
  ]) assert.ok(body.includes(anchor), `Native-create RPC is missing: ${anchor}`);
  const lineInsert = body.match(/INSERT INTO public\.dg_native_job_lines\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\);/i);
  assert.ok(lineInsert, 'Native-create line INSERT must be inspectable');
  const columns=splitSqlList(lineInsert[1]); const values=splitSqlList(lineInsert[2]);
  assert.equal(columns.length,values.length,'Native-create line INSERT columns and values must align');
  for (const field of ['sidelight_specifications','transom_t_bar_size','transom_glass_type_code','transom_custom_glass_description'])
    assert.equal(columns.filter((column)=>column===field).length,1,`Native-create line INSERT must contain ${field} exactly once`);
};
const nativeCreate = extractGlassRpc(glassSourceMigration,'dg_create_native_job');
validateNativeCreate(nativeCreate);
for (const invalidFixture of [
  nativeCreate.replace('INSERT INTO public.dg_native_jobs','REMOVED_NATIVE_JOB_INSERT'),
  nativeCreate.replace('INSERT INTO public.dg_native_job_create_commands','REMOVED_COMMAND_RECEIPT'),
  nativeCreate.replace('BEGIN','BEGIN\n  PERFORM p_internal_job_id;'),
  nativeCreate.replace('BEGIN','BEGIN\n  UPDATE public.dg_native_jobs SET revision=revision;'),
  nativeCreate.replace('BEGIN','BEGIN\n  ON CONFLICT (line_id) DO UPDATE SET line_index=EXCLUDED.line_index;'),
  nativeCreate.replace('WHERE job.internal_job_id=v_job_id','WHERE job.internal_job_id=NULL'),
  nativeCreate.replace("'idempotent_replay', true","'replay_removed', true"),
  nativeCreate.replaceAll('panel_sidelights,sidelight_specifications','panel_sidelights'),
  nativeCreate.replace('BEGIN','BEGIN\n  Oâ€¦2328 tokens truncatedâ€¦'),
  nativeCreate.replace('NOT public.dg_validate_direct_dimension_glass_source(line)','true'),
]) assert.throws(()=>validateNativeCreate(invalidFixture),'Corrupt native-create fixture must fail closed');
assert.equal((glassSourceMigration.match(/NOT public\.dg_validate_direct_dimension_glass_source\(line\)/g) ?? []).length,3,
  'All three write RPCs must use the same direct-dimension validator');
for (const requiredGuard of [
  "pg_catalog.jsonb_typeof(v_specification->'side') <> 'string'",
  "pg_catalog.jsonb_typeof(v_specification->'index') <> 'number'",
  'v_index <> pg_catalog.trunc(v_index)', 'v_index < 1 OR v_index > 3',
  'v_identity = ANY(v_identities)', "v_key <> ALL(ARRAY[",
  "pg_catalog.jsonb_typeof(v_specification->'finishedWidth') IS DISTINCT FROM 'string'",
  "pg_catalog.length(pg_catalog.btrim(v_specification->>'finishedWidth')) NOT BETWEEN 1 AND 32",
  "v_specification->>'tBarSize' NOT IN ('1.5','2.25')",
  "v_specification->>'glassTypeCode' NOT IN ('CLEAR','SATIN_ETCH','CUSTOM')",
  "v_specification->>'panelSizeMode' NOT IN ('standard','custom')",
  "pg_catalog.jsonb_typeof(v_specification->'tBarSize') IS DISTINCT FROM 'string'",
  "pg_catalog.jsonb_typeof(v_specification->'glassTypeCode') IS DISTINCT FROM 'string'",
  "pg_catalog.jsonb_typeof(v_specification->'customGlassDescription') IS DISTINCT FROM 'string'",
  "pg_catalog.jsonb_typeof(v_specification->'panelSizeMode') IS DISTINCT FROM 'string'",
  "pg_catalog.jsonb_typeof(v_specification->'panelConstructionNotes') IS DISTINCT FROM 'string'",
  "pg_catalog.length(v_specification->>'customGlassDescription') > 200",
  "pg_catalog.length(v_specification->>'panelConstructionNotes') > 1000",
  "pg_catalog.length(pg_catalog.btrim(v_specification->>'customGlassDescription')) NOT BETWEEN 1 AND 200",
  "pg_catalog.jsonb_typeof(p_line->'transom_t_bar_size') IS DISTINCT FROM 'string'",
  "pg_catalog.jsonb_typeof(p_line->'transom_glass_type_code') IS DISTINCT FROM 'string'",
  "pg_catalog.jsonb_typeof(p_line->'transom_custom_glass_description') IS DISTINCT FROM 'string'",
]) assert.ok(glassSourceMigration.includes(requiredGuard), `Missing direct-dimension persistence guard: ${requiredGuard}`);
assert.equal((glassSourceMigration.match(/COALESCE\(NULLIF\(v_line->'sidelight_specifications','null'::jsonb\),'\[\]'::jsonb\)/g) ?? []).length,3,
  'All write paths must normalize omitted or explicit-null sidelight specifications to an empty array');
assert.doesNotMatch(glassSourceMigration,/(?:INSERT INTO|UPDATE|DELETE FROM) public\.(?:dg_jobs|dg_job_lines|dg_production|dg_calendar|dg_daily_capacity|dg_fulfillment|dg_document|dg_email)/i);
assert.doesNotMatch(glassSourceMigration,/\b(?:ALTER SEQUENCE|setval|RESTART)\b/i);
assert.equal((glassSourceMigration.match(/pg_catalog\.nextval\(/g) ?? []).length,(migration.match(/pg_catalog\.nextval\(/g) ?? []).length,
  'The replacement create RPC must preserve, not expand, the accepted sequence allocation behavior');
assert.ok(glassSourcePreflight.startsWith('-- READ-ONLY HOSTED CATALOG PREFLIGHT — DO NOT MODIFY INTO AN APPLY SCRIPT'));
const executablePreflight = glassSourcePreflight.replace(/^\s*--.*$/gm,'').trim();
const preflightTokens = executablePreflight.replace(/'(?:''|[^'])*'/g,"''");
assert.match(executablePreflight,/^WITH\b[\s\S]*\bSELECT\b[\s\S]*;$/i);
assert.equal((preflightTokens.match(/;\s*(?=\S)/g) ?? []).length,0,'Preflight must contain one top-level statement');
assert.doesNotMatch(preflightTokens,/\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|CALL|COPY|DO|LOCK|SET|RESET|nextval|setval)\b|\bCOMMENT\s+ON\b|\bEXPLAIN\s+ANALYZE\b|\bSET\s+ROLE\b/i,
  'Preflight must remain catalog-only and read-only');
assert.doesNotMatch(preflightTokens,/\b(?:SELECT|PERFORM|CALL)\s+(?:public\.)?dg_[a-z0-9_]+\s*\(/i,
  'Preflight must not invoke a DoorGo business function');
assert.doesNotMatch(glassSourcePreflight,/\bre_[A-Za-z0-9]{20,}\b|\beyJ[A-Za-z0-9_-]{40,}\b/,
  'Preflight must not contain credential-shaped text');
assert.doesNotMatch(glassSourcePreflight,/target_functions\s*\(signature\)|JOIN\s+target_functions/i,
  'RPC discovery must not filter by rendered identity-argument strings');
assert.match(glassSourcePreflight,/p\.proname IN \('dg_create_native_job','dg_update_native_job','dg_create_transferred_native_job'\)/,
  'RPC discovery must begin with exact proname matching');
assert.match(glassSourcePreflight,/ARRAY\(SELECT argument_oid FROM pg_catalog\.unnest\(p\.proargtypes::pg_catalog\.oid\[\]\)/,
  'Expected logical signatures must compare normalized elements without oidvector lower-bound dependence');
for (const field of ['schema_name','function_name','function_kind','identity_arguments','arguments','argument_names','argument_modes',
  'input_argument_type_oids','rendered_input_types','parallel_setting','strict','leakproof','execution_grants',
  'matches_expected_logical_signature','exact_name_overload_count','diagnostic_fallback_needed','fallback_candidates']) {
  assert.ok(glassSourcePreflight.includes(`'${field}'`), `Missing RPC catalog evidence: ${field}`);
}
for (const evidence of [
  'native_line_columns','native_line_constraints','native_line_indexes','native_line_security',
  'write_rpc_definitions','write_rpc_discovery_diagnostics','dg_sequence_runtime_state','provenance_transfer_and_stale_revision_guards',
  'migration_history_candidates','supabase_migration_history','complete_column_definition','latest_25_rows','exact_row_count',
  'pg_get_functiondef','definition_md5','security_definer','calculated_next_candidate','direct_dimension_migration_already_recorded',
]) assert.ok(glassSourcePreflight.includes(evidence),`Missing direct-dimension preflight evidence: ${evidence}`);

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
