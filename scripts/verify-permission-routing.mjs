import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real navigation and server page guards; replace only framework,
// session identity and downstream data/UI dependencies. No network or database.
let currentAccess;
const cache = new Map();
class Redirect extends Error { constructor(destination) { super(destination); this.destination = destination; } }
class DataBoundary extends Error {}
const realModules = new Set([
  'lib/auth/access.ts', 'lib/auth/protected-access.ts', 'lib/auth/password-setup.ts',
  'lib/admin/users-contract.ts', 'lib/app-shell/navigation.ts',
  'lib/documents/document-definitions.ts', 'lib/production-schedule/view-access.ts',
]);
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const testModule = { exports: {} };
  cache.set(file, testModule.exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  function requireForPage(name) {
    if (name === 'server-only') return {};
    if (name === 'next/navigation') return { redirect: destination => { throw new Redirect(destination); } };
    if (name === 'react/jsx-runtime') return { jsx: () => ({}), jsxs: () => ({}) };
    const candidate = (name.startsWith('@/') ? name.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), name))) + '.ts';
    if (candidate === 'lib/auth/current-access.ts') return { getCurrentDoorGoAccess: async () => currentAccess };
    if (realModules.has(candidate)) return load(candidate);
    return new Proxy({}, { get: () => function downstreamBoundary() { throw new DataBoundary(); } });
  }
  vm.runInNewContext(code, { require: requireForPage, module: testModule, exports: testModule.exports }, { filename: file });
  return testModule.exports;
}
const auth = load('lib/auth/access.ts');
const nav = load('lib/app-shell/navigation.ts');
const admin = load('lib/admin/users-contract.ts');
const definitions = load('lib/documents/document-definitions.ts').DOORGO_DOCUMENT_DEFINITIONS;
const routes = [
  ['/production-board', 'production'], ['/production-checkpoints', 'production_checkpoints'],
  ['/calendar', 'calendar'], ['/jobs', 'jobs'], ['/documents', 'documents'],
  ['/glass-calculator', 'tools'], ['/manager', 'settings', 'users'],
];
const secondaryRoutes = [
  ['app/production-schedule/page.tsx', 'production', 'view'],
  ['app/production-recovery/page.tsx', 'production', 'view'],
  ['app/jobs/new/page.tsx', 'jobs', 'use'], ['app/jobs/import/page.tsx', 'jobs', 'use'],
  ['app/jobs/[internalJobId]/edit/page.tsx', 'jobs', 'view'],
  ['app/jobs/[internalJobId]/work-order/page.tsx', 'jobs', 'view'],
];
const none = Object.fromEntries(auth.DOORGO_PERMISSION_KEYS.map(key => [key, 'none']));
function access(permissions, manager = false) {
  return { state: 'active', user: { id: 'fixture', email: null }, profile: {
    userId: 'fixture', displayName: 'Fixture', active: true, isManager: manager,
    companyLocation: null, mustChangePassword: false,
  }, permissions: { ...none, ...permissions } };
}
async function routeAllowed(file, value) {
  currentAccess = value;
  try {
    await load(file).default({ searchParams: Promise.resolve({}), params: Promise.resolve({ internalJobId: 'fixture' }) });
    return true;
  } catch (error) {
    if (error instanceof Redirect) { assert.ok(['/account', '/login', '/account/change-password'].includes(error.destination)); return false; }
    if (error instanceof DataBoundary) return true;
    throw error;
  }
}
let checks = 0;
async function verify(value) {
  const navigation = nav.buildProtectedAppNavigation(value);
  const home = navigation.filter(item => item.showOnHome).map(item => item.href);
  for (const [route, ...keys] of routes) {
    const expected = keys.some(key => auth.hasAtLeastView(value, key));
    assert.equal(navigation.some(item => item.href === route), expected, `sidebar ${route}`);
    assert.equal(home.includes(route), expected, `Home ${route}`);
    assert.equal(await routeAllowed(`app${route}/page.tsx`, value), expected, `direct route ${route}`);
    checks += 3;
  }
  assert.equal(admin.adminWorkspaceAccess(value).users, auth.hasAtLeastView(value, 'users'));
  assert.equal(admin.adminWorkspaceAccess(value).settings, auth.hasAtLeastView(value, 'settings'));
  for (const [file, key, minimum] of secondaryRoutes) {
    const expected = minimum === 'use' ? auth.canUse(value, key) : auth.hasAtLeastView(value, key);
    assert.equal(await routeAllowed(file, value), expected, file); checks++;
  }
}
// Every key alone, and every key denied while all others are enabled.
for (const manager of [false, true]) {
  for (const key of auth.DOORGO_PERMISSION_KEYS) {
    for (const level of ['none', 'view', 'use']) await verify(access({ [key]: level }, manager));
    await verify(access({ ...Object.fromEntries(auth.DOORGO_PERMISSION_KEYS.map(k => [k, 'use'])), [key]: 'none' }, manager));
  }
}
const aaron = access({ calendar: 'use', tools: 'use' });
assert.deepEqual(Array.from(nav.buildProtectedAppNavigation(aaron), item => item.label), ['Home', 'Calendar', 'Glass Calculator', 'Account']);
await verify(aaron);
for (const state of ['inactive_profile', 'missing_profile', 'unauthenticated']) {
  const value = { ...access(Object.fromEntries(auth.DOORGO_PERMISSION_KEYS.map(k => [k, 'use']))), state };
  await verify(value);
}
const setup = access(Object.fromEntries(auth.DOORGO_PERMISSION_KEYS.map(k => [k, 'use'])));
setup.profile.mustChangePassword = true;
for (const [route] of routes) assert.equal(await routeAllowed(`app${route}/page.tsx`, setup), false);
assert.equal(definitions.find(item => item.key === 'glass_calculation').entryHref, '/glass-calculator');
assert.equal(definitions.find(item => item.key === 'glass_calculation').permissionKey, 'tools');
assert.equal(definitions.find(item => item.key === 'work_order').permissionKey, 'jobs');
assert.match(fs.readFileSync('app/documents/page.tsx', 'utf8'), /hasAtLeastView\(access, definition.permissionKey\)/);
assert.match(fs.readFileSync('app/page.tsx', 'utf8'), /navigation\.filter\(\(item\) => item\.showOnHome\)/);
assert.equal(fs.existsSync('app/reports'), false, 'Reports stays reserved; no invented workspace');
assert.equal(nav.buildProtectedAppNavigation(access({ reports: 'use' })).some(item => item.showOnHome), false);
console.log(`Permission routing: PASS (${checks} navigation/Home/actual page-guard checks; all nine keys, manager variants, Aaron regression, secondary routes and reserved Reports).`);
