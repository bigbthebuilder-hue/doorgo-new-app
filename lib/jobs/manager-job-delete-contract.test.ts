import assert from 'node:assert/strict';
import { assertManagerDeleteAccess } from './manager-job-delete-contract';
import type { CurrentDoorGoAccess } from '../auth/access';
import { JobIntakeFailure } from './job-intake-types';

const active = (manager: boolean): CurrentDoorGoAccess => ({ state: 'active', user: { id: manager ? 'manager' : 'staff', email: null }, profile: { userId: manager ? 'manager' : 'staff', displayName: 'Test', active: true, isManager: manager, companyLocation: null, mustChangePassword: false }, permissions: {} });

assert.throws(() => assertManagerDeleteAccess(active(false)), (error) => error instanceof JobIntakeFailure && error.code === 'manager_required');
assert.doesNotThrow(() => assertManagerDeleteAccess(active(true)));
console.log('Manager job-delete service authorization passed.');
