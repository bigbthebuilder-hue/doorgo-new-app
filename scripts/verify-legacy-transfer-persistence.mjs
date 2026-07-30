import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20260730000000_add_legacy_transfer_persistence.sql', 'utf8');
const lower = migration.toLowerCase();
const functionBody = lower.match(/create function public\.dg_create_transferred_native_job\([\s\S]*?\n\$\$;/)?.[0];
assert.ok(functionBody, 'Exact dedicated transfer-create RPC must exist');
assert.match(lower, /add column transfer_source_system text[\s\S]*add column transfer_source_fingerprint text/);
for (const field of ['legacy_job_id','transfer_source_system','transfer_schema','transfer_version',
  'transfer_source_identifier_kind','transfer_source_identifier_value','transfer_source_saved_at',
  'transfer_exported_at','transfer_source_fingerprint']) assert.ok(lower.includes(field), `Missing ${field}`);
assert.match(lower, /visible_identifier_kind in \('biztrack_sales_order','door_go_reference','legacy_job_id'\)/);
assert.match(lower, /transfer_fingerprint_unique[\s\S]*transfer_source_unique/);
assert.match(lower, /dg_enforce_native_job_identity_immutability[\s\S]*old\.legacy_job_id is distinct from new\.legacy_job_id/);
assert.match(lower, /old\.transfer_source_fingerprint is distinct from new\.transfer_source_fingerprint/);
assert.match(functionBody, /security definer set search_path=''/);
assert.match(functionBody, /permission_key='jobs' and permission\.access_level='use'/);
assert.doesNotMatch(functionBody, /manager/);
assert.doesNotMatch(functionBody, /\bnextval\s*\(/, 'Transfer RPC must not allocate a DG reference');
assert.match(functionBody, /source_job_state'<>'active'/);
assert.match(functionBody, /direction'<>'legacy_to_native'/);
assert.match(functionBody, /unsupported_payload/);
for (const code of ['duplicate_source_fingerprint','duplicate_sales_order','duplicate_door_go_reference',
  'duplicate_legacy_job_id','duplicate_legacy_transfer','idempotency_conflict']) assert.ok(functionBody.includes(code), `Missing ${code}`);
for (const prohibited of ['dg_production','dg_calendar','dg_daily_capacity','dg_fulfillment','dg_document','dg_email'])
  assert.ok(!functionBody.includes(prohibited), `Transfer RPC references prohibited ${prohibited}`);
assert.doesNotMatch(functionBody, /public\.dg_job(?:s|_lines)\b/, 'Transfer RPC must not read or write legacy mirrors');
assert.match(functionBody, /insert into public\.dg_native_jobs[\s\S]*insert into public\.dg_native_job_lines[\s\S]*insert into public\.dg_native_job_create_commands/);
assert.match(functionBody, /'legacy_transfer'[\s\S]*'idempotent_replay',false/);
assert.match(lower, /revoke all on function public\.dg_create_transferred_native_job\(uuid,jsonb,jsonb,jsonb\) from public,anon,service_role/);
assert.match(lower, /grant execute on function public\.dg_create_transferred_native_job\(uuid,jsonb,jsonb,jsonb\) to authenticated/);
assert.match(lower, /alter function public\.dg_create_transferred_native_job\(uuid,jsonb,jsonb,jsonb\) owner to postgres/);
assert.match(lower, /revoke all on table public\.dg_native_jobs,public\.dg_native_job_lines,public\.dg_native_job_create_commands[\s\S]*from public,anon,authenticated,service_role/);
assert.match(lower, /revoke all on sequence public\.dg_native_job_reference_seq from public,anon,authenticated,service_role/);
assert.match(lower, /'legacy_job_id',job\.legacy_job_id[\s\S]*'visible_identifier_kind',job\.visible_identifier_kind/);
assert.doesNotMatch(lower, /\b(alter sequence|setval|restart)\b/);
assert.doesNotMatch(lower, /(?:insert into|update|delete from) public\.(?:dg_production|dg_calendar|dg_daily_capacity|dg_fulfillment|dg_document|dg_email)/);
console.log('Legacy transfer persistence/RPC contract verification passed');
