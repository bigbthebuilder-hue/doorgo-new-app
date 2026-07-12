import assert from 'node:assert/strict';
import { normalizePublicSupabaseEnvironment } from './public-env';

function run(): void {
  assert.deepEqual(
    normalizePublicSupabaseEnvironment({
      url: ' https://example.supabase.co ',
      publishableKey: ' public-key ',
    }),
    { url: 'https://example.supabase.co', publishableKey: 'public-key' },
  );
  assert.throws(
    () => normalizePublicSupabaseEnvironment({ url: undefined, publishableKey: 'key' }),
    /configuration is missing/,
  );
  assert.throws(
    () => normalizePublicSupabaseEnvironment({ url: 'url', publishableKey: ' ' }),
    /configuration is missing/,
  );
  console.log('Public Supabase environment verification passed');
}

run();
