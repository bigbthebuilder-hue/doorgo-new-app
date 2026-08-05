import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260728000000_create_native_job_persistence.sql';
const sql = readFileSync(migrationPath, 'utf8');
const glassSourceMigration = readFileSync('supabase/migrations/20260805000000_add_direct_dimension_glass_sources.sql', 'utf8');
const normalized = sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
const requireMatch = (pattern, message) => assert.match(normalized, pattern, message);
const rejectMatch = (pattern, message) => assert.doesNotMatch(normalized, pattern, message);

assert.ok(normalized.startsWith('begin;'), 'Migration must be transactional');
assert.ok(normalized.endsWith('commit;'), 'Migration must commit its transaction');

for (const table of ['dg_native_jobs', 'dg_native_job_lines', 'dg_native_job_create_commands']) {
  requireMatch(new RegExp(`create table public\\.${table} \\(`), `Missing ${table}`);
  requireMatch(new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS`);
  requireMatch(new RegExp(`alter table public\\.${table} no force row level security`), `${table} must follow the no-force-RLS contract`);
  requireMatch(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`), `${table} grants must fail closed`);
}

for (const column of [
  'internal_job_id uuid primary key', 'biztrack_sales_order text', 'door_go_reference text',
  'visible_identifier text not null', 'visible_identifier_kind text not null', 'origin text not null',
  'legacy_job_id text', 'legacy_identifier_kind text', 'revision bigint not null default 1',
  'lifecycle_stage text not null default \'draft\'', 'shop_hours numeric(10,2)', 'po_numbers jsonb not null',
  'archived_at timestamptz', 'archived_by_user_id uuid', 'created_by_user_id uuid not null',
  'updated_by_user_id uuid not null',
]) assert.ok(normalized.includes(column), `Missing native-job column contract: ${column}`);
for (const column of [
  'line_id uuid primary key', 'internal_job_id uuid not null', 'line_index integer not null',
  'line_status text not null default \'active\'', 'mode text not null', 'glass_warnings jsonb not null',
  'glass_blockers jsonb not null', 'glass_units jsonb not null', 'panel_sidelights jsonb not null',
  'include_diagram_on_work_order boolean not null default true',
]) assert.ok(normalized.includes(column), `Missing native-line column contract: ${column}`);
for (const field of ['sidelight_specifications','transom_t_bar_size','transom_glass_type_code','transom_custom_glass_description']) {
  assert.ok(glassSourceMigration.includes(field), `Missing direct-dimension glass source persistence: ${field}`);
}
assert.match(glassSourceMigration,/transom_t_bar_size IN \('1\.5','2\.25'\)/);
assert.match(glassSourceMigration,/CREATE OR REPLACE FUNCTION public\.dg_create_native_job\(/);
assert.match(glassSourceMigration,/CREATE OR REPLACE FUNCTION public\.dg_update_native_job\(/);
assert.match(glassSourceMigration,/CREATE OR REPLACE FUNCTION public\.dg_create_transferred_native_job\(/);
assert.match(glassSourceMigration,/CREATE OR REPLACE FUNCTION public\.dg_validate_direct_dimension_glass_source\(p_line jsonb\)/);
assert.equal((glassSourceMigration.match(/NOT public\.dg_validate_direct_dimension_glass_source\(line\)/g) ?? []).length, 3);
assert.match(glassSourceMigration,/v_identity = ANY\(v_identities\)/);
assert.match(glassSourceMigration,/v_index < 1 OR v_index > 3/);
assert.match(glassSourceMigration,/finishedWidth'[\s\S]*NOT BETWEEN 1 AND 32/);
assert.match(glassSourceMigration,/customGlassDescription'[\s\S]*> 200/);
assert.match(glassSourceMigration,/panelConstructionNotes'[\s\S]*> 1000/);
assert.doesNotMatch(glassSourceMigration,/tokens? truncated|output truncated|omitted for brevity|chars? truncated|Oâ€¦|…\s*\d+\s+tokens?/i);
const directDimensionCreate = glassSourceMigration.match(
  /CREATE OR REPLACE FUNCTION public\.dg_create_native_job\([\s\S]*?\n\$\$;/i,
)?.[0];
assert.ok(directDimensionCreate,'Direct-dimension native-create replacement must be extractable');
assert.doesNotMatch(directDimensionCreate,/p_internal_job_id|p_expected_revision|UPDATE public\.dg_native_jobs|submitted_bound|aggregate_bound|ON CONFLICT \(line_id\) DO UPDATE|stale_revision/i);
for (const anchor of ['INSERT INTO public.dg_native_jobs','INSERT INTO public.dg_native_job_lines',
  'INSERT INTO public.dg_native_job_create_commands','WHERE job.internal_job_id=v_job_id'])
  assert.ok(directDimensionCreate.includes(anchor),`Direct-dimension native create is missing ${anchor}`);

requireMatch(/create sequence public\.dg_native_job_reference_seq[^;]*start with 7/, 'Sequence must start at 7');
requireMatch(/'dg-' \|\| pg_catalog\.lpad\(v_candidate::text, 6, '0'\)/, 'DG formatting must use six digits');
requireMatch(/nextval\('public\.dg_native_job_reference_seq'::pg_catalog\.regclass\)/, 'Allocator must use the sequence');
requireMatch(/from public\.dg_native_jobs as job[^;]*door_go_reference[^;]*from public\.dg_jobs as legacy[^;]*legacy\.job_id/s, 'Allocator must check native and legacy collisions');
requireMatch(/loop[^;]*nextval[\s\S]*exit when not exists[\s\S]*end loop/, 'Allocator must skip occupied candidates atomically');

for (const name of ['dg_create_native_job', 'dg_update_native_job', 'dg_archive_native_job', 'dg_get_native_job', 'dg_list_native_jobs']) {
  const blockPattern = new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`);
  const match = normalized.match(blockPattern);
  assert.ok(match, `Missing RPC ${name}`);
  assert.match(match[0], /security definer set search_path = ''/, `${name} must be SECURITY DEFINER with an empty search path`);
  assert.match(match[0], /auth\.uid\(\)/, `${name} must derive the actor from auth.uid()`);
  assert.match(match[0], /public\.dg_user_profiles[\s\S]*profile\.active\s*=\s*true/, `${name} must require an active profile`);
  assert.match(match[0], /public\.dg_user_permissions[\s\S]*permission_key\s*=\s*'jobs'/, `${name} must check jobs permission`);
  assert.doesNotMatch(match[0], /is_manager|manager/, `${name} must not use manager fallback`);
  requireMatch(new RegExp(`revoke all on function public\\.${name}\\([^;]+from public, ?anon`), `${name} must revoke PUBLIC and anon`);
  requireMatch(new RegExp(`grant execute on function public\\.${name}\\([^;]+to authenticated`), `${name} must grant only authenticated execution`);
}

requireMatch(/create or replace function public\.dg_create_native_job\( p_command_id uuid, p_origin text, p_legacy_job_id text, p_legacy_identifier_kind text, p_header jsonb, p_lines jsonb \)/, 'Create signature drifted');
requireMatch(/create or replace function public\.dg_update_native_job\( p_internal_job_id uuid, p_expected_revision bigint, p_header jsonb, p_lines jsonb \)/, 'Update signature drifted');
requireMatch(/create or replace function public\.dg_archive_native_job\( p_internal_job_id uuid, p_expected_revision bigint, p_reason text \)/, 'Archive signature drifted');
requireMatch(/create or replace function public\.dg_get_native_job\( p_internal_job_id uuid, p_include_archived boolean default false \)/, 'Get signature drifted');
requireMatch(/create or replace function public\.dg_list_native_jobs\( p_include_archived boolean default false, p_limit integer default 50, p_cursor_updated_at timestamptz default null, p_cursor_internal_job_id uuid default null \)/, 'List signature drifted');

requireMatch(/dg_native_job_create_commands[\s\S]*request_fingerprint[\s\S]*idempotent_replay/, 'Create idempotency receipt behavior is missing');
requireMatch(/pg_advisory_xact_lock/, 'Command idempotency must be concurrency-safe');
requireMatch(/native_job\.idempotency_conflict/, 'Command UUID conflicts must fail closed');
requireMatch(/for update[\s\S]*native_job\.stale_revision/, 'Revision checks must lock and fail stale writes');
requireMatch(/revision\s*=\s*job\.revision\s*\+\s*1/, 'Successful update/archive must increment revision once');
requireMatch(/line_status\s*=\s*'archived'[\s\S]*not exists/, 'Omitted lines must be archived');
rejectMatch(/delete from public\.dg_native_|truncate (?:table )?public\.dg_native_/, 'Normal RPCs must not hard-delete native data');

requireMatch(/p_limit\s*<\s*1 or p_limit\s*>\s*100/, 'List limit must be 1 through 100');
requireMatch(/\(\(p_cursor_updated_at is null\) <> \(p_cursor_internal_job_id is null\)\)/, 'Cursor pair must be all-or-none');
requireMatch(/job\.updated_at\s*<\s*p_cursor_updated_at or \(job\.updated_at\s*=\s*p_cursor_updated_at and job\.internal_job_id\s*<\s*p_cursor_internal_job_id\)/, 'Cursor continuation ordering is incorrect');
requireMatch(/order by job\.updated_at desc,job\.internal_job_id desc limit p_limit\s*\+\s*1/, 'List must fetch one extra row in deterministic order');
requireMatch(/'items',v_items,'page'[\s\S]*'has_more',v_has_more[\s\S]*'next_cursor_updated_at'[\s\S]*'next_cursor_internal_job_id'/, 'List response envelope is incomplete');
rejectMatch(/\bp_offset\b|\boffset\s+|page_number|total_count/, 'Offset/page-number/mandatory-count pagination is forbidden');

requireMatch(/unique index dg_native_jobs_sales_order_unique/, 'Normalized Sales Order uniqueness is required');
requireMatch(/unique index dg_native_jobs_dg_reference_unique/, 'Normalized DG uniqueness is required');
requireMatch(/duplicate_sales_order[\s\S]*duplicate_door_go_reference/, 'Duplicate identifiers must fail closed');
requireMatch(/origin in \('native', 'legacy_transfer'\)/, 'Origin vocabulary drifted');
rejectMatch(/\bndg-/, 'NDG identifiers are forbidden');

rejectMatch(/(?:alter|drop|truncate) table public\.dg_jobs|(?:alter|drop|truncate) table public\.dg_job_lines/, 'Legacy mirror schema must remain untouched');
rejectMatch(/(?:insert into|update|delete from) public\.dg_jobs|(?:insert into|update|delete from) public\.dg_job_lines/, 'Legacy mirror writes are forbidden');
rejectMatch(/public\.dg_production_|public\.dg_calendar_|resend|send_email|document_move|paperwork/, 'Operational side effects are forbidden');
rejectMatch(/create policy/, 'No direct-table RLS policy is approved');
rejectMatch(/grant (?:select|insert|update|delete|all) on (?:table )?public\.dg_native_/, 'Direct authenticated table access is forbidden');

console.log('Hosted native-job persistence migration verification passed');
