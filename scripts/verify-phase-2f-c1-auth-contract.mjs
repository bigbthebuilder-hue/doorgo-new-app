import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const normalize = (text) => text.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
const requirePattern = (text, pattern, message) => assert.match(normalize(text), pattern, message);
const rejectPattern = (text, pattern, message) => assert.doesNotMatch(normalize(text), pattern, message);

const profiles = read('supabase/migrations/20260712000000_create_dg_user_profiles.sql');
const permissions = read('supabase/migrations/20260712010000_create_dg_user_permissions.sql');
const passwordSetupMigration = read('supabase/migrations/20260712020000_add_dg_password_setup_requirement.sql');
const packageJson = JSON.parse(read('package.json'));
const browserClient = read('lib/supabase/client.ts');
const publicEnvironment = read('lib/supabase/public-env.ts');
const authServer = read('lib/supabase/server.ts');
const trustedServer = read('lib/supabase/trusted-read-server.ts');
const login = `${read('app/login/page.tsx')}\n${read('app/login/login-form.tsx')}\n${read('app/login/actions.ts')}\n${read('lib/auth/login.ts')}`;
const passwordSetup = `${read('app/account/change-password/page.tsx')}\n${read('app/account/change-password/password-form.tsx')}\n${read('app/account/change-password/actions.ts')}`;
const logoutRoute = read('app/auth/logout/route.ts');
const logoutBehavior = read('lib/auth/logout.ts');
const logout = `${logoutRoute}\n${logoutBehavior}`;
const account = read('app/account/page.tsx');
const access = read('lib/auth/access.ts');
const contract = read('docs/authentication-permissions-contract.md');
const productionBoardPage = read('app/production-board/page.tsx');
const environmentExample = read('.env.example');
const safeRedirect = read('lib/auth/safe-redirect.ts');
const currentAccess = read('lib/auth/current-access.ts');
const protectedAccess = `${read('lib/auth/access.ts')}\n${read('lib/auth/protected-access.ts')}`;

requirePattern(profiles, /create table if not exists public\.dg_user_profiles \( user_id uuid primary key, display_name text not null, active boolean not null default true, is_manager boolean not null default false, company_location text null, created_at timestamptz not null default now\(\), updated_at timestamptz not null default now\(\)/, 'Profile fields are incomplete');
requirePattern(profiles, /foreign key \(user_id\) references auth\.users\(id\) on delete restrict/, 'Profile auth FK must restrict deletion');
requirePattern(profiles, /check \(length\(btrim\(display_name\)\) > 0\)/, 'Display name must be nonempty');
requirePattern(profiles, /enable row level security/, 'Profile RLS is required');
requirePattern(profiles, /for select to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/, 'Profile read policy must be self-only');

requirePattern(permissions, /primary key \(user_id, permission_key\)/, 'Permission key must be composite');
requirePattern(permissions, /references public\.dg_user_profiles\(user_id\) on delete cascade/, 'Permission FK must cascade');
requirePattern(permissions, /access_level in \('none', 'view', 'use'\)/, 'Access vocabulary is incorrect');
requirePattern(permissions, /enable row level security/, 'Permission RLS is required');
requirePattern(permissions, /for select to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/, 'Permission read policy must be self-only');

for (const migration of [profiles, permissions]) {
  rejectPattern(migration, /for (insert|update|delete|all)/, 'Authenticated mutation policies are forbidden');
  requirePattern(migration, /revoke insert, update, delete, truncate[\s\S]*from authenticated/, 'Authenticated mutations must be revoked');
  requirePattern(migration, /revoke all[\s\S]*from anon/, 'Anon access must be revoked');
}

assert.ok(packageJson.dependencies['@supabase/ssr'], '@supabase/ssr dependency is required');
requirePattern(browserClient, /getpublicsupabaseenvironment/, 'Browser auth must use the public environment helper');
requirePattern(publicEnvironment, /next_public_supabase_url[\s\S]*next_public_supabase_publishable_key/, 'Public environment helper must use exact public variables');
rejectPattern(browserClient, /service_role|supabase_service_role_key/, 'Browser code must not reference service credentials');
rejectPattern(publicEnvironment, /service_role|supabase_service_role_key/, 'Public environment helper must not reference service credentials');
requirePattern(authServer, /createServerClient/i, 'Cookie-aware auth server client is required');
requirePattern(authServer, /cookies\(\)/, 'Auth server client must use Next cookies');
requirePattern(trustedServer, /server-only[\s\S]*supabase_service_role_key/, 'Service role must remain server-only');
requirePattern(login, /use server[\s\S]*signinwithpassword/i, 'Login must use server-side password authentication');
requirePattern(login, /auth\.getuser\(\)/i, 'Password login must verify the resulting server session');
rejectPattern(login, /signinwithotp|magic link/i, 'Magic Link login is forbidden');
rejectPattern(login, /signUp\(/i, 'Public signup UI is forbidden');
assert.equal(existsSync('app/signup'), false, 'A public signup page is forbidden');
requirePattern(logout, /auth\.signOut/i, 'Logout route is required');
requirePattern(logout, /signout\(\{ scope: 'local' \}\)/, 'Normal logout must be local-device only');
requirePattern(account, /display name[\s\S]*account state[\s\S]*manager[\s\S]*company\/location[\s\S]*module permissions/, 'Account verification details are incomplete');

const initialPermissionKeys = ['production', 'production_checkpoints', 'calendar', 'jobs', 'documents', 'tools', 'reports', 'settings', 'users'];
assert.equal(initialPermissionKeys.length, 9, 'There must be nine supported initial permission keys');
for (const key of initialPermissionKeys) {
  assert.ok(access.includes(`'${key}'`), `Missing broad permission key: ${key}`);
}
requirePattern(account, /doorgo_permission_keys\.map/, 'Account must display every supported permission');
requirePattern(contract, /production_checkpoints[\s\S]*none[\s\S]*view[\s\S]*use[\s\S]*manager status[\s\S]*broad `production` permission/, 'Dedicated checkpoint permission semantics are incomplete');
requirePattern(access, /return access\.permissions\[permissionkey\] \?\? 'none'/, 'Missing permission rows must resolve to none');
rejectPattern(access, /raw_user_meta_data|user_metadata/, 'Raw metadata must not authorize access');
rejectPattern(profiles, /salesperson|calendar_id|calendar_color/, 'Auth profiles must not own salesperson/calendar identity');
requirePattern(contract, /america\/vancouver[\s\S]*production board intentionally remains public and unprotected/, 'Current scope must document timezone and public Board');
rejectPattern(productionBoardPage, /getcurrentdoorgoaccess|redirect\(['"]\/login/, 'Production Board must remain unprotected');
requirePattern(safeRedirect, /decoded\.startswith\(['"]\/\/['"]\)[\s\S]*decoded\.includes\(['"]\\\\['"]\)[\s\S]*target\.origin !== origin/, 'Redirect helper must reject protocol-relative, backslash, and foreign-origin targets');
rejectPattern(login, /error\.message|setmessage\([^)]*error/, 'Login must not expose raw authentication errors');
requirePattern(login, /email or password is incorrect/, 'Login must use a generic non-enumerating result');
requirePattern(login, /key=\{state\.passwordresetkey\}[\s\S]*type="password"/, 'Failed login must remount the password field');
requirePattern(login, /passwordresetkey: previousstate\.passwordresetkey \+ 1/, 'Every returned login failure must advance the reset key');
rejectPattern(login, /type loginformstate = \{[^}]*\bpassword\s*:/, 'Login action state must not contain a password value');
rejectPattern(account, /access\.user\.email|user\.email/, 'Account must not render authenticated email');
requirePattern(logoutRoute, /export async function post[\s\S]*handlelocallogoutrequest[\s\S]*supabase\.auth\.signout\(options\)/, 'POST route must delegate to tested local logout behavior');
requirePattern(logoutBehavior, /operations\.signout\(\{ scope: 'local' \}\)[\s\S]*signoutfailed = boolean\(error\)[\s\S]*catch[\s\S]*signoutfailed = true[\s\S]*getsafelocalredirectpath/, 'Logout must handle returned and thrown local signOut failures');
requirePattern(account, /sign-out could not be completed/, 'Account must show a generic logout failure state');
requirePattern(currentAccess, /auth\.getuser\(\)[\s\S]*\.eq\(['"]user_id['"], userdata\.user\.id\)/, 'Current access must derive identity from verified Auth user');
rejectPattern(currentAccess, /raw_user_meta_data|user_metadata/, 'Current access must not authorize from raw metadata');
requirePattern(currentAccess, /must_change_password/, 'Current access must load the password setup flag');
rejectPattern(currentAccess, /profileerror\.message|permissionerror\.message/, 'Raw profile and permission errors must not be interpolated');
requirePattern(protectedAccess, /function getprotectedaccessredirect[\s\S]*state === 'unauthenticated'[\s\S]*state === 'active' && access\.profile\.mustchangepassword[\s\S]*return '\/account\/change-password'[\s\S]*return null/, 'Password setup guard must depend only on authentication, active state, and setup state');

requirePattern(passwordSetupMigration, /begin;[\s\S]*alter table public\.dg_user_profiles[\s\S]*must_change_password boolean not null default true[\s\S]*password_changed_at timestamptz null[\s\S]*commit;/, 'Password setup migration must be independent and transactional');
requirePattern(passwordSetupMigration, /create or replace function public\.complete_dg_initial_password_setup\(\)[\s\S]*security definer[\s\S]*set search_path = ''/, 'Completion RPC must have a fixed empty search path');
requirePattern(passwordSetupMigration, /auth\.uid\(\)[\s\S]*caller_user_id is null[\s\S]*update public\.dg_user_profiles as profile[\s\S]*where profile\.user_id = caller_user_id[\s\S]*and profile\.active = true[\s\S]*and profile\.must_change_password = true/, 'Completion RPC must derive identity and use qualified caller-owned update predicates');
rejectPattern(passwordSetupMigration, /complete_dg_initial_password_setup\([^)]*(uuid|user_id)/, 'Completion RPC cannot accept a user identity');
requirePattern(passwordSetupMigration, /revoke all[\s\S]*from public[\s\S]*revoke all[\s\S]*from anon[\s\S]*grant execute[\s\S]*to authenticated/, 'Completion RPC grants are unsafe');
requirePattern(passwordSetup, /auth\.updateuser\(\{ password \}\)[\s\S]*complete_dg_initial_password_setup/, 'Authenticated password update must precede profile completion');
requirePattern(passwordSetup, /your password was changed, but setup could not be finalized/, 'Partial success must be reported accurately');
rejectPattern(passwordSetup, /console\.(?:log|error)\([^)]*password/, 'Passwords must not be logged');
rejectPattern(passwordSetup, /(?:redirect|new url)\([^)]*password/, 'Passwords must not be placed in URLs');
for (const variable of [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
]) {
  assert.ok(environmentExample.includes(`${variable}=`), `Missing environment placeholder: ${variable}`);
}

const changedText = execFileSync('git', ['diff', '--', 'lib/production-board/normalize.ts', 'lib/production-board/flow-constants.ts', 'lib/production-board/flow-presentation.ts'], { encoding: 'utf8' });
assert.equal(changedText, '', 'Production-flow calculations must not change in Phase 2F-C1');

const scopedFiles = [browserClient, authServer, login, passwordSetup, logout, account].join('\n');
rejectPattern(scopedFiles, /dg_production_flow_checkpoints[\s\S]*(insert|update|delete)/, 'Checkpoint mutations are forbidden');

const normalizeRepositoryPath = (path) => path.replaceAll('\\', '/').replace(/^\.\//, '');
const isReviewableRepositoryPath = (path) =>
  (path === '.env.example' || /\.(?:ts|tsx|js|jsx|mjs|cjs|sql|md|json)$/.test(path)) &&
  !path.startsWith('node_modules/') &&
  !path.startsWith('.next/') &&
  !path.startsWith('out/') &&
  !path.startsWith('build/') &&
  !path.startsWith('.tmp-') &&
  path !== '.env.local';

assert.equal(
  normalizeRepositoryPath('lib\\supabase\\trusted-read-server.ts'),
  'lib/supabase/trusted-read-server.ts',
  'Windows repository paths must normalize consistently',
);
assert.equal(
  isReviewableRepositoryPath(normalizeRepositoryPath('lib\\auth\\future-untracked.ts')),
  true,
  'Relevant untracked source files must be reviewable',
);
assert.equal(isReviewableRepositoryPath('node_modules/example/index.js'), false);
assert.equal(isReviewableRepositoryPath('.next/server/app.js'), false);
assert.equal(isReviewableRepositoryPath('.env.local'), false);

const repositoryPaths = new Set(
  execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .map(normalizeRepositoryPath),
);
assert.ok(
  repositoryPaths.has('lib/supabase/trusted-read-server.ts'),
  'Clean-tree discovery must include committed tracked source files',
);

const reviewablePaths = [...repositoryPaths].filter(
  (path) =>
    isReviewableRepositoryPath(path) &&
    existsSync(path) &&
    statSync(path).isFile(),
);
const laterPhaseCheckpointActionBoundary = new Set([
  'lib/production-flow/checkpoint-action-contract.ts',
  'lib/production-flow/checkpoint-service.ts',
  'lib/production-flow/checkpoint-read-service.ts',
]);
const applicationPaths = reviewablePaths.filter(
  (path) => !path.startsWith('scripts/') && !path.endsWith('.test.ts') && !laterPhaseCheckpointActionBoundary.has(path),
);
const applicationDiffText = applicationPaths.map((path) => read(path)).join('\n');

rejectPattern(applicationDiffText, /\.rpc\((?!\s*['"]complete_dg_initial_password_setup['"])/, 'Only the password-setup RPC may be introduced in Phase 2F-C1');
rejectPattern(
  applicationDiffText,
  /\.from\(['"]dg_production_flow_checkpoints['"]\)[\s\S]{0,300}\.(?:insert|update|upsert|delete)\(/,
  'No checkpoint mutation path may be introduced',
);
rejectPattern(
  applicationDiffText,
  /create table(?: if not exists)? public\.(?:[^\s(]*(?:company|tenant|organization|location|salesperson|calendar)[^\s(]*)/,
  'Complex company, tenant, salesperson, or calendar identity tables are forbidden',
);
rejectPattern(
  `${profiles}\n${permissions}`,
  /\b(?:salesperson|calendar_id|calendar_color)\b/,
  'Auth schema must not contain salesperson or calendar identity fields',
);
rejectPattern(
  applicationDiffText,
  /raw_user_meta_data|user_metadata/,
  'Raw user metadata must not authorize application access',
);

const serviceRoleReferences = reviewablePaths.filter((path) =>
  /SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(read(path)),
).sort();
assert.deepEqual(
  serviceRoleReferences,
  [
    '.env.example',
    'lib/supabase/trusted-read-server.ts',
    'scripts/verify-phase-2f-c1-auth-contract.mjs',
  ],
  'Service-role references must remain limited to approved runtime, placeholder, and verifier files',
);

const runtimeServiceRoleReferences = serviceRoleReferences.filter(
  (path) => path !== '.env.example' && !path.startsWith('scripts/'),
);
assert.deepEqual(
  runtimeServiceRoleReferences,
  ['lib/supabase/trusted-read-server.ts'],
  'Runtime service-role use must remain isolated to the trusted read-only server module',
);

console.log('Phase 2F-C1 authentication contract verification passed');
