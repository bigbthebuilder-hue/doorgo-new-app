// Static coverage and migration-shape checks; NOT PostgreSQL authorization execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = file => fs.readFileSync(file, 'utf8');
const migration = '20261027120000_business_access_requirement.sql';
const sql = read('supabase/migrations/' + migration);
const lists = [...sql.matchAll(/FOREACH name IN ARRAY ARRAY\[([\s\S]*?)\] LOOP/g)]
  .map(match => [...match[1].matchAll(/'([^']+)'/g)].map(value => value[1]));
const [guarded, tables] = lists;
assert.equal(guarded.length, 31);
assert.equal(new Set(guarded).size, guarded.length);
assert.equal(tables.length, 19);
assert.match(sql, /current_setting\('doorgo.business_access_cutover',true\)/);
assert.match(sql, /p.user_id = auth.uid\(\) AND p.active AND p.must_change_password IS FALSE/);
assert.match(sql, /AS RESTRICTIVE FOR SELECT TO authenticated USING \(public.dg_business_eligible\(\)\)/);
assert.match(sql, /count_found<>1/);
assert.match(sql, /pg_catalog.pg_get_functiondef\(target.oid\)/);
assert.match(sql, /PERFORM public.dg_require_business_access\(\)/);
assert.match(sql, /ERRCODE='42501'/);
assert.match(sql, /REVOKE ALL ON FUNCTION public.dg_business_eligible\(\) FROM PUBLIC,anon,authenticated,service_role/);
assert.doesNotMatch(sql, /DROP FUNCTION|ALTER TABLE|CREATE TABLE|session_id|sessions_valid/);
assert.ok(!tables.includes('dg_user_profiles') && !tables.includes('dg_user_permissions'));

const definitions = new Map();
const policies = new Map();
for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && f < migration).sort()) {
  const source = read('supabase/migrations/' + file);
  for (const match of source.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(\w+)[\s\S]*?AS\s+(\$\w*\$)([\s\S]*?)\2\s*;/gi)) {
    definitions.set(match[1], { source: match[0], body: match[3], file });
  }
  for (const match of source.matchAll(/CREATE POLICY\s+\w+\s+ON public\.(\w+)[\s\S]*?;/gi)) policies.set(match[1], match[0]);
}
for (const name of guarded) {
  const definition = definitions.get(name);
  assert.ok(definition, name);
  assert.match(definition.source, /LANGUAGE plpgsql/i, name);
  assert.match(definition.body.trim(), /^(DECLARE|BEGIN)\b/i, name);
  assert.match(definition.body.trim(), /END\s*;?$/i, name);
}
for (const table of tables) assert.ok(policies.has(table), table);

// Every locally defined direct profile-based business gate must be covered.
// Explicit exclusions are setup/admin (already protected), private formatters,
// synchronization triggers and trusted password transitions, not business RPCs.
const excluded = new Set(['complete_dg_initial_password_setup', 'dg_users_require_access',
  'dg_users_record', 'sync_native_job_shop_date_to_production', 'dg_apply_staff_away_to_capacity_row']);
for (const [name, definition] of definitions) {
  if (!definition.body.includes('dg_user_profiles') || excluded.has(name) || name.startsWith('dg_password_')) continue;
  assert.ok(guarded.includes(name) || /public\.dg_(calendar_require_use|settings_scope|staff_away_scope|calendar_exception_scope|users_require_access)\(/.test(definition.body),
    `Uncovered profile-based gate: ${name} (${definition.file})`);
}
// Preserve the accepted linked-note restriction and existing module gates verbatim.
assert.ok(definitions.get('calendar_linked_fulfillment_notes').body.includes('dg_calendar_require_use(false)'));
assert.ok(!guarded.includes('calendar_linked_fulfillment_notes'));
assert.match(read('app/account/change-password/actions.ts'), /runEmployeePasswordSetup/);
assert.doesNotMatch(read('app/account/change-password/actions.ts'), /complete_dg_initial_password_setup/);
for (const directory of ['app', 'components']) {
  function check(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = folder + '/' + entry.name;
      if (entry.isDirectory()) check(file);
      else if (/\.tsx?$/.test(file)) assert.doesNotMatch(read(file), /runInactive(?:EmployeePasswordSetup|AdminPasswordReset|Reactivation|RequirePasswordChange)/, file);
    }
  }
  check(directory);
}
console.log('Business authorization static coverage passed: 31 guarded boundaries, 19 restrictive SELECT policies; trusted setup caller. Runtime SQL remains separate.');
