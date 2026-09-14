import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const read = file => readFileSync(file, 'utf8');
const sql = read('supabase/migrations/20260911010000_add_user_administration.sql');
for (const name of ['dg_admin_list_users', 'dg_admin_update_permissions', 'dg_admin_set_user_active', 'dg_admin_require_password_change', 'dg_admin_provision_user']) {
  const body = sql.match(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?END \\$\\$;`))?.[0];
  assert.ok(body, name);
  assert.match(body, /SECURITY DEFINER SET search_path = ''/);
  assert.match(body, new RegExp(`dg_users_require_access\\(${name === 'dg_admin_list_users' ? 'false' : 'true'}\\)`));
}
assert.match(sql, /p\.active AND NOT p\.must_change_password/);
assert.match(sql, /p\.permission_key='users'/);
assert.match(sql, /actor=p_user_id AND NOT p_active/);
assert.match(sql, /FROM PUBLIC,anon,authenticated,service_role/);
assert.match(sql, /OWNER TO postgres/);
assert.match(sql, /ON CONFLICT\(user_id,permission_key\) DO UPDATE/);
assert.match(sql, /FOR UPDATE/);
assert.match(sql, /pg_catalog\.jsonb_object_keys\(p_permissions\)\)<>9/);
assert.doesNotMatch(sql, /CREATE TABLE|GRANT (INSERT|UPDATE|DELETE|ALL)|auth\.users|password_hash|encrypted_password/);
assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
const server = read('lib/admin/users-server.ts');
assert.match(server, /^import 'server-only'/);
assert.match(server, /getCurrentDoorGoAccess\(\)/);
assert.deepEqual([...server.matchAll(/admin\.(\w+)\(/g)].map(match => match[1]).sort(), ['createUser','deleteUser','getUserById','updateUserById']);
assert.doesNotMatch(server, /console\.(log|error)\([^;]*(password|form|error\.message)/);
const ui = read('components/manager/UsersAccessWorkspace.tsx');
assert.doesNotMatch(ui, /users-server|trusted-read-server|auth\.admin|localStorage|sessionStorage/);
assert.match(ui, /type="password"/);
assert.match(ui, /key=\{passwordKey\}/);
assert.match(ui, /readOnly=\{!canEdit\}/);
const page = read('app/manager/page.tsx');
assert.match(page, /if \(!tabs.settings && !tabs.users\) redirect/);
assert.match(page, /if \(tabs.settings\)[\s\S]*load_manager_capacity_configuration/);
assert.match(page, /tabs.users \? await loadAdminUsers\(\) : null/);
const intake = read('app/jobs/new/page.tsx');
assert.doesNotMatch(intake, /isLocalJobIntakeAvailable|DOORGO_LOCAL_INTAKE_ENABLED|local-job-intake-repository/);
assert.match(intake, /canUse\(access, 'jobs'\)/);
assert.match(intake, /JobHeaderForm canEdit/);
assert.match(read('lib/jobs/job-intake-repository.ts'), /return createHostedJobIntakeRepository/);
assert.match(read('lib/jobs/local-job-intake-repository.ts'), /!enabled \|\| runtime === 'production'/);
console.log('Admin SQL, server boundary, workspace and hosted intake static checks passed.');
const temporary = mkdtempSync(path.resolve('.tmp-admin-users-'));
try {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--strict', '--pretty', 'false', '--target', 'es2022', '--module', 'commonjs', '--moduleResolution', 'node', '--esModuleInterop', '--outDir', temporary, 'lib/admin/users-service.test.ts'], { stdio: 'inherit' });
  execFileSync(process.execPath, ['--test', path.join(temporary, 'admin/users-service.test.js')], { stdio: 'inherit' });
} finally { rmSync(temporary, { recursive: true, force: true }); }
