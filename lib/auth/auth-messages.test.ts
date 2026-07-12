import assert from 'node:assert/strict';
import {
  getLogoutRedirectPath,
} from './auth-messages';

function run(): void {
  assert.equal(getLogoutRedirectPath(false), '/login');
  assert.equal(getLogoutRedirectPath(true), '/account?error=signout_failed');
  console.log('Authentication message verification passed');
}

run();
