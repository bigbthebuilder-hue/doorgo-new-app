import assert from 'node:assert/strict';
import type { CurrentDoorGoAccess } from '../auth/access';
import { buildProtectedAppNavigation, buildPublicAppNavigation, isAppNavigationItemActive } from './navigation';

function access(permissions: Record<string, 'none' | 'view' | 'use'>): CurrentDoorGoAccess {
  return {
    state: 'active',
    user: { id: 'user-1', email: 'test@example.invalid' },
    profile: {
      userId: 'user-1', displayName: 'Test User', active: true, isManager: false,
      companyLocation: null, mustChangePassword: false,
    },
    permissions,
  };
}

assert.deepEqual(buildPublicAppNavigation().map((item) => item.href), ['/production-board']);
assert.equal(isAppNavigationItemActive('/production-board', buildPublicAppNavigation()[0]), true);
assert.equal(isAppNavigationItemActive('/production-schedule', buildPublicAppNavigation()[0]), false);

const none = buildProtectedAppNavigation(access({})).map((item) => item.href);
assert.deepEqual(none, ['/', '/production-board', '/account']);
const homeItem = buildProtectedAppNavigation(access({}))[0];
assert.equal(isAppNavigationItemActive('/', homeItem), true);
assert.equal(isAppNavigationItemActive('/jobs', homeItem), false);

const jobs = buildProtectedAppNavigation(access({ jobs: 'view' })).map((item) => item.href);
assert.ok(jobs.includes('/jobs'));
assert.ok(jobs.includes('/glass-calculator'));
assert.ok(!jobs.includes('/production-schedule'));
const jobsItem = buildProtectedAppNavigation(access({ jobs: 'view' })).find((item) => item.href === '/jobs');
assert.ok(jobsItem);
assert.equal(isAppNavigationItemActive('/jobs/example/edit', jobsItem), true);

const production = buildProtectedAppNavigation(access({ production: 'use', production_checkpoints: 'none' })).map((item) => item.href);
assert.ok(production.includes('/production-schedule'));
assert.ok(!production.includes('/production-recovery'));
assert.ok(!production.includes('/production-checkpoints'));

const checkpoints = buildProtectedAppNavigation(access({ production_checkpoints: 'view' })).map((item) => item.href);
assert.ok(!checkpoints.includes('/production-checkpoints'));

const homeDestinations = buildProtectedAppNavigation(access({ jobs: 'view', production: 'view', production_checkpoints: 'view' }))
  .filter((item) => item.showOnHome)
  .map((item) => item.href);
assert.deepEqual(homeDestinations, ['/production-board', '/production-schedule', '/jobs', '/glass-calculator']);

const documents = buildProtectedAppNavigation(access({ documents: 'view' })).map((item) => item.href);
assert.ok(documents.includes('/documents'));

const inactive: CurrentDoorGoAccess = {
  state: 'inactive_profile',
  user: { id: 'user-1', email: 'test@example.invalid' },
  profile: {
    userId: 'user-1', displayName: 'Test User', active: false, isManager: false,
    companyLocation: null, mustChangePassword: false,
  },
  permissions: { jobs: 'use', production: 'use' },
};
assert.deepEqual(
  buildProtectedAppNavigation(inactive).map((item) => item.href),
  ['/', '/production-board', '/account'],
);

console.log('Desktop shell navigation contract passed');
