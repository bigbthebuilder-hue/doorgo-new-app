// Static source verification only. No database connection or SQL execution.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
const migration = '20261028120000_restrict_legacy_user_administration.sql';
const targets = ['public.dg_admin_set_user_active(uuid,boolean)',
  'public.dg_admin_require_password_change(uuid)'];
function verify(source) {
  const sql = source.replace(/^\s*--.*$/gm, '');
  assert.match(sql, /^\s*BEGIN;[\s\S]*COMMIT;\s*$/);
  assert.match(sql, /current_setting\('doorgo\.legacy_admin_cutover',true\) IS DISTINCT FROM 'approved'/);
  assert.ok(sql.indexOf('users.legacy_cutover_approval_required') < sql.indexOf('REVOKE ALL'));
  assert.match(sql, /IF to_regprocedure\(signature\) IS NULL THEN/);
  for (const signature of ['public.dg_password_deactivate(uuid)',
    'public.dg_password_require_change(uuid)', 'public.dg_password_request_reactivation(uuid,uuid)',
    'public.dg_password_finish(uuid,uuid,text)', 'public.dg_require_business_access()']) {
    assert.ok(sql.slice(0,sql.indexOf('REVOKE ALL')).includes(signature), signature);
  }
  assert.match(sql, /IF to_regprocedure\('public\.complete_dg_initial_password_setup\(\)'\) IS NOT NULL THEN/);
  const revokes = [...sql.matchAll(/REVOKE ALL ON FUNCTION ([\s\S]*?) FROM ([\s\S]*?) RESTRICT;/g)];
  assert.equal(revokes.length, 1);
  assert.equal(revokes[0][1].replace(/\s/g,''), targets.join(','));
  assert.equal(revokes[0][2].replace(/\s/g,''), 'PUBLIC,anon,authenticated,service_role');
  assert.match(sql, /ARRAY\['anon','authenticated','service_role'\]/);
  assert.match(sql, /client_oid := to_regrole\(client_name\)/);
  assert.match(sql, /IF client_oid IS NULL THEN RAISE EXCEPTION/);
  assert.match(sql, /has_function_privilege\(client_oid,target_oid,'EXECUTE'\) OR EXISTS/);
  assert.match(sql, /pg_has_role\(client_oid,r\.oid,'MEMBER'\)/);
  assert.match(sql, /AND has_function_privilege\(r\.oid,target_oid,'EXECUTE'\)/);
  assert.match(sql, /RAISE EXCEPTION 'users\.legacy_execution_remains/);
  assert.ok(sql.indexOf('users.legacy_execution_remains') > sql.indexOf('REVOKE ALL'));
  assert.ok(sql.indexOf('users.legacy_execution_remains') < sql.indexOf('COMMIT;'));
  assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP|GRANT|UPDATE|INSERT|DELETE|TRUNCATE|CASCADE)\b/i);
  assert.doesNotMatch(sql, /\bEXECUTE\s+(?:format|replace|')|\bEXCEPTION\s+WHEN/i);
  assert.doesNotMatch(sql, /dg_admin_(?:provision_user|list_users|update_permissions)|\b(?:pet_|wt_)/);
}
const source = read('supabase/migrations/' + migration);
verify(source);
// Reject representative regressions in the static contract, not simulated SQL.
for (const [before, after] of [
  ['PUBLIC,anon,authenticated,service_role RESTRICT','anon,authenticated,service_role RESTRICT'],
  ["pg_has_role(client_oid,r.oid,'MEMBER')", 'false'],
  ["has_function_privilege(client_oid,target_oid,'EXECUTE')", 'false'],
  ["RAISE EXCEPTION 'users.legacy_execution_remains:", "RAISE NOTICE 'users.legacy_execution_remains:"],
  ['public.dg_admin_require_password_change(uuid)\n  FROM', 'public.dg_admin_provision_user(uuid,text,text,boolean,jsonb)\n  FROM'],
]) {
  assert.ok(source.includes(before));
  const changed = source.replace(before, after);
  assert.throws(() => verify(changed));
}
const order = [
  '20261015120000_restrict_calendar_linked_fulfillment_notes.sql',
  '20261016120000_password_operation_foundation.sql',
  '20261023120000_employee_password_operation_snapshot.sql',
  '20261023140000_password_atomic_profile_transitions.sql',
  '20261023160000_retire_legacy_password_completion.sql',
  '20261026120000_password_require_change.sql',
  '20261026160000_password_reactivation.sql',
  '20261027120000_business_access_requirement.sql', migration,
];
assert.deepEqual([...order].sort(), order);
for (const file of order) assert.ok(readdirSync('supabase/migrations').includes(file), file);
assert.doesNotMatch(read('lib/admin/users-service.ts'), /dg_admin_set_user_active|dg_admin_require_password_change/);
assert.match(read('lib/admin/users-server.ts'), /runEmployeeDeactivation/);
assert.match(read('lib/admin/users-server.ts'), /runRequirePasswordChange/);
console.log('Legacy-admin restriction: scoped ACLs, cutover prerequisites, effective/member-role denial, preservation and migration order PASS. Static only; SQL runtime unverified.');
