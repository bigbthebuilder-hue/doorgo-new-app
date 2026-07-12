import assert from 'node:assert/strict';
import {
  executeInitialPasswordSetup,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validateNewPasswordForm,
} from './password-setup';

function passwordForm(password: string, confirmation: string): FormData {
  const form = new FormData();
  form.set('newPassword', password);
  form.set('confirmPassword', confirmation);
  return form;
}

async function run(): Promise<void> {
  assert.equal(validateNewPasswordForm(new FormData()).valid, false);
  assert.deepEqual(validateNewPasswordForm(passwordForm('different values', 'do not match')), {
    valid: false,
    message: 'The passwords do not match.',
  });
  assert.equal(
    validateNewPasswordForm(passwordForm('x'.repeat(MIN_PASSWORD_LENGTH - 1), 'x'.repeat(MIN_PASSWORD_LENGTH - 1))).valid,
    false,
  );
  assert.equal(
    validateNewPasswordForm(passwordForm('x'.repeat(MAX_PASSWORD_LENGTH + 1), 'x'.repeat(MAX_PASSWORD_LENGTH + 1))).valid,
    false,
  );
  const valid = validateNewPasswordForm(
    passwordForm('a long passphrase', 'a long passphrase'),
  );
  assert.equal(valid.valid, true);

  const order: string[] = [];
  assert.equal(
    await executeInitialPasswordSetup('a long passphrase', {
      async updatePassword() {
        order.push('update-password');
        return { error: null };
      },
      async completeProfileSetup() {
        order.push('complete-profile');
        return { error: null };
      },
    }),
    'success',
  );
  assert.deepEqual(order, ['update-password', 'complete-profile']);

  let completionCalled = false;
  assert.equal(
    await executeInitialPasswordSetup('a long passphrase', {
      async updatePassword() {
        return { error: new Error('failed') };
      },
      async completeProfileSetup() {
        completionCalled = true;
        return { error: null };
      },
    }),
    'password_update_failed',
  );
  assert.equal(completionCalled, false);

  assert.equal(
    await executeInitialPasswordSetup('a long passphrase', {
      async updatePassword() {
        return { error: null };
      },
      async completeProfileSetup() {
        return { error: new Error('failed') };
      },
    }),
    'profile_completion_failed',
  );

  assert.equal(
    await executeInitialPasswordSetup('a long passphrase', {
      async updatePassword() {
        return { error: null };
      },
      async completeProfileSetup() {
        throw new Error('transport failed');
      },
    }),
    'profile_completion_failed',
  );

  console.log('Initial password setup verification passed');
}

void run();
