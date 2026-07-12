import assert from 'node:assert/strict';
import { handleLocalLogoutRequest } from './logout';

function logoutRequest(failureRedirect?: string): Request {
  const formData = new FormData();
  if (failureRedirect !== undefined) {
    formData.set('failureRedirect', failureRedirect);
  }
  return new Request('http://localhost:3000/auth/logout', {
    method: 'POST',
    body: formData,
  });
}

async function run(): Promise<void> {
  const scopes: string[] = [];
  const success = await handleLocalLogoutRequest(logoutRequest(), {
    async signOut(options) {
      scopes.push(options.scope);
      return { error: null };
    },
  });
  assert.equal(success.status, 303);
  assert.equal(success.headers.get('location'), 'http://localhost:3000/login');
  assert.deepEqual(scopes, ['local']);

  const returnedError = await handleLocalLogoutRequest(logoutRequest(), {
    async signOut() {
      return { error: new Error('raw provider detail') };
    },
  });
  assert.equal(returnedError.status, 303);
  assert.equal(
    returnedError.headers.get('location'),
    'http://localhost:3000/account?error=signout_failed',
  );

  const thrownError = await handleLocalLogoutRequest(logoutRequest(), {
    async signOut() {
      throw new Error('raw provider detail');
    },
  });
  assert.equal(thrownError.status, 303);
  assert.equal(
    thrownError.headers.get('location'),
    'http://localhost:3000/account?error=signout_failed',
  );
  assert.equal(await thrownError.text(), '');

  for (const unsafeRedirect of [
    'https://attacker.example/steal',
    '//attacker.example/steal',
    '%2F%2Fattacker.example%2Fsteal',
    '%252F%252Fattacker.example%252Fsteal',
    '/\\attacker.example/steal',
    '\\attacker.example\\steal',
  ]) {
    const response = await handleLocalLogoutRequest(
      logoutRequest(unsafeRedirect),
      {
        async signOut() {
          return { error: new Error('failed') };
        },
      },
    );
    assert.equal(
      response.headers.get('location'),
      'http://localhost:3000/account?error=signout_failed',
      `Unsafe logout redirect was accepted: ${unsafeRedirect}`,
    );
  }

  const forcedSetupFailure = await handleLocalLogoutRequest(
    logoutRequest('/account/change-password?error=signout_failed'),
    {
      async signOut() {
        return { error: new Error('failed') };
      },
    },
  );
  assert.equal(forcedSetupFailure.status, 303);
  assert.equal(
    forcedSetupFailure.headers.get('location'),
    'http://localhost:3000/account/change-password?error=signout_failed',
  );

  console.log('Local logout route behavior verification passed');
}

void run();
