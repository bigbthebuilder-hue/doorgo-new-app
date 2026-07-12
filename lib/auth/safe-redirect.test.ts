import assert from 'node:assert/strict';
import { getSafeLocalRedirectPath } from './safe-redirect';

const origin = 'https://doorgo.example';

function run(): void {
  for (const valid of [
    '/account',
    '/production-board',
    '/account?tab=permissions',
    '/account#permissions',
  ]) {
    assert.equal(getSafeLocalRedirectPath(valid, origin), valid);
  }

  for (const malicious of [
    '//attacker.example',
    'https://attacker.example/path',
    'http://attacker.example/path',
    'javascript:alert(1)',
    '\\attacker.example',
    '/\\attacker.example',
    '\\/attacker.example',
    '%2F%2Fattacker.example',
    '%252F%252Fattacker.example',
    '%5C%5Cattacker.example',
    '%255C%255Cattacker.example',
    '/%5Cattacker.example',
    '%',
    '%E0%A4%A',
    '',
    '   ',
    'account',
  ]) {
    assert.equal(
      getSafeLocalRedirectPath(malicious, origin),
      '/account',
      malicious,
    );
  }

  assert.equal(getSafeLocalRedirectPath(null, origin), '/account');
  assert.equal(
    getSafeLocalRedirectPath('//attacker.example', origin, '/login'),
    '/login',
  );

  console.log('Safe authentication redirect verification passed');
}

run();
