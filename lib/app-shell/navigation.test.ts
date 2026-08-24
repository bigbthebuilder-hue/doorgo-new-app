import assert from 'node:assert/strict';
import type { CurrentDoorGoAccess } from '../auth/access';
import { buildProtectedAppNavigation, buildPublicAppNavigation, isAppNavigationItemActive, protectedLandingDestination } from './navigation';

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
assert.deepEqual(none, ['/', '/account']);
const homeItem = buildProtectedAppNavigation(access({}))[0];
assert.equal(isAppNavigationItemActive('/', homeItem), true);
assert.equal(isAppNavigationItemActive('/jobs', homeItem), false);

const jobs = buildProtectedAppNavigation(access({ jobs: 'view' })).map((item) => item.href);
assert.ok(jobs.includes('/jobs'));
assert.ok(jobs.includes('/glass-calculator'));
assert.ok(!jobs.includes('/production-schedule'));
assert.ok(!jobs.includes('/calendar'));
const jobsItem = buildProtectedAppNavigation(access({ jobs: 'view' })).find((item) => item.href === '/jobs');
assert.ok(jobsItem);
assert.equal(isAppNavigationItemActive('/jobs/example/edit', jobsItem), true);

const production = buildProtectedAppNavigation(access({ production: 'use', production_checkpoints: 'none' })).map((item) => item.href);
assert.ok(production.includes('/production-board'));
assert.ok(!production.includes('/production-schedule'));
assert.ok(!production.includes('/calendar'));
assert.ok(!production.includes('/production-recovery'));
assert.ok(!production.includes('/production-checkpoints'));

const checkpoints = buildProtectedAppNavigation(access({ production_checkpoints: 'view' })).map((item) => item.href);
assert.ok(checkpoints.includes('/production-checkpoints'));

const homeDestinations = buildProtectedAppNavigation(access({ jobs: 'view', production: 'view', production_checkpoints: 'view' }))
  .filter((item) => item.showOnHome)
  .map((item) => item.href);
assert.deepEqual(homeDestinations, ['/production-board', '/production-checkpoints', '/jobs', '/glass-calculator']);

const documents = buildProtectedAppNavigation(access({ documents: 'view' })).map((item) => item.href);
assert.ok(documents.includes('/documents'));

const calendar = buildProtectedAppNavigation(access({ calendar: 'view' })).map((item) => item.href);
assert.ok(calendar.includes('/calendar'));
assert.deepEqual(calendar, ['/', '/calendar', '/account']);
assert.equal(protectedLandingDestination(access({calendar:'view'})),'/calendar');
assert.equal(protectedLandingDestination(access({jobs:'view'})),'/jobs');
assert.equal(protectedLandingDestination(access({production:'view'})),'/production-board');
assert.equal(buildProtectedAppNavigation(access({production:'use'})).some((item)=>['View Schedule','Edit Schedule'].includes(item.label)),false);

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
  ['/', '/account'],
);

console.log('Desktop shell navigation contract passed');
