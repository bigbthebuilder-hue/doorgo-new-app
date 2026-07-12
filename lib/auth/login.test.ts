import assert from 'node:assert/strict';
import {
  executePasswordLogin,
  getFailedLoginState,
  INITIAL_LOGIN_FORM_STATE,
  INVALID_CREDENTIALS_MESSAGE,
  readLoginCredentials,
} from './login';

async function run(): Promise<void> {
  const validForm = new FormData();
  validForm.set('email', ' office@example.com ');
  validForm.set('password', 'temporary password');
  assert.deepEqual(readLoginCredentials(validForm), {
    email: 'office@example.com',
    password: 'temporary password',
  });

  assert.equal(readLoginCredentials(new FormData()), null);
  assert.equal(INVALID_CREDENTIALS_MESSAGE, 'Email or password is incorrect.');
  const firstFailure = getFailedLoginState(INITIAL_LOGIN_FORM_STATE);
  const secondFailure = getFailedLoginState(firstFailure);
  assert.equal(firstFailure.passwordResetKey, 1);
  assert.equal(secondFailure.passwordResetKey, 2);
  assert.deepEqual(Object.keys(firstFailure).sort(), [
    'message',
    'passwordResetKey',
    'status',
  ]);
  assert.equal('password' in firstFailure, false);

  const calls: string[] = [];
  const success = await executePasswordLogin(
    { email: 'office@example.com', password: 'temporary password' },
    {
      async signInWithPassword() {
        calls.push('password-sign-in');
        return { error: null };
      },
      async verifyUser() {
        calls.push('verify-user');
        return { user: {}, error: null };
      },
      async signOutLocal() {
        calls.push('local-sign-out');
      },
    },
  );
  assert.equal(success, true);
  assert.deepEqual(calls, ['password-sign-in', 'verify-user']);

  let verificationCalled = false;
  const invalid = await executePasswordLogin(
    { email: 'unknown@example.com', password: 'incorrect' },
    {
      async signInWithPassword() {
        return { error: new Error('provider detail') };
      },
      async verifyUser() {
        verificationCalled = true;
        return { user: null, error: null };
      },
      async signOutLocal() {},
    },
  );
  assert.equal(invalid, false);
  assert.equal(verificationCalled, false);

  let localSignOutCalled = false;
  const unverified = await executePasswordLogin(
    { email: 'office@example.com', password: 'temporary password' },
    {
      async signInWithPassword() {
        return { error: null };
      },
      async verifyUser() {
        return { user: null, error: new Error('verification failed') };
      },
      async signOutLocal() {
        localSignOutCalled = true;
      },
    },
  );
  assert.equal(unverified, false);
  assert.equal(localSignOutCalled, true);

  console.log('Password login verification passed');
}

void run();
