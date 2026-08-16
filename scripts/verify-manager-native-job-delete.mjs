import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260815010000_add_manager_native_job_delete.sql','utf8');
const rollback=fs.readFileSync('scripts/rollback-manager-native-job-delete.sql','utf8');
const action=fs.readFileSync('lib/jobs/job-intake-actions.ts','utf8');
const service=fs.readFileSync('lib/jobs/manager-job-delete-contract.ts','utf8');
const control=fs.readFileSync('components/jobs/JobDeleteControl.tsx','utf8');
const page=fs.readFileSync('app/jobs/[internalJobId]/edit/page.tsx','utf8');

assert.match(migration,/CREATE OR REPLACE FUNCTION public\.dg_delete_native_job\([\s\S]*SECURITY DEFINER[\s\S]*SET search_path = ''/);
assert.match(migration,/auth\.uid\(\)[\s\S]*profile\.active = true[\s\S]*profile\.is_manager = true/);
assert.doesNotMatch(migration,/p_(?:actor|manager|user)(?:_|\s)/i);
assert.match(migration,/FOR UPDATE[\s\S]*stale_revision/);
assert.match(migration,/set_config\('doorgo\.manager_job_delete', 'authorized', true\)/);
for(const guard of ['reject_production_status_event_mutation','reject_production_booking_move_mutation','reject_production_booking_completion_event_mutation']) assert.match(migration,new RegExp(`CREATE OR REPLACE FUNCTION public\\.${guard}[\\s\\S]*current_setting\\('doorgo\\.manager_job_delete', true\\) = 'authorized'`));
for(const table of ['dg_production_status_events','dg_production_booking_completion_events','dg_production_booking_moves','dg_production_bookings','dg_native_job_create_commands','dg_native_job_lines','dg_native_jobs']) assert.match(migration,new RegExp(`DELETE FROM public\\.${table}`));
assert.ok(migration.indexOf('DELETE FROM public.dg_production_status_events')<migration.indexOf('DELETE FROM public.dg_production_bookings'));
assert.ok(migration.indexOf('DELETE FROM public.dg_native_job_lines')<migration.lastIndexOf('DELETE FROM public.dg_native_jobs'));
assert.match(migration,/REVOKE ALL[\s\S]*PUBLIC, anon, service_role[\s\S]*GRANT EXECUTE[\s\S]*authenticated/);
assert.match(rollback,/Permanently deleted data cannot be restored[\s\S]*DROP FUNCTION public\.dg_delete_native_job\(uuid,bigint\)/);
assert.doesNotMatch(rollback,/DELETE FROM|DROP TABLE|TRUNCATE/i);
assert.doesNotMatch(rollback,/doorgo\.manager_job_delete|current_setting|set_config/);
assert.match(action,/getCurrentDoorGoAccess\(\)[\s\S]*deleteJobWithAccess/);
assert.match(service,/access\.state !== 'active' \|\| !access\.profile\.isManager/);
assert.match(page,/canPermanentlyDelete=\{access\.state === 'active' && access\.profile\.isManager\}/);
assert.match(control,/Permanently Delete Job[\s\S]*This cannot be undone[\s\S]*Delete Job Permanently/);
assert.match(control,/visibleIdentifier[\s\S]*customer/);
console.log('Manager native-job delete static contract passed.');
