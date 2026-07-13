import assert from 'node:assert/strict';
import { createCheckpointService } from './checkpoint-action-contract';

const request = { commandId: '11111111-1111-4111-8111-111111111111', productionDate: '2026-07-12', openingCarryHours: 1 };
const unavailable = { ok: false, code: 'unavailable', message: 'The checkpoint could not be saved. Please try again.' };

async function expectSanitized(createClient: Parameters<typeof createCheckpointService>[0]) {
  const result = await createCheckpointService(createClient)('confirm', request);
  assert.deepEqual(result, unavailable);
  assert.doesNotMatch(JSON.stringify(result), /secret|sql|token|session|stack/i);
}

async function main() {
  await expectSanitized(async () => { throw new Error('secret client creation stack'); });
  await expectSanitized(async () => ({ getUser: async () => { throw new Error('secret session token'); }, rpc: async () => { throw new Error('unreachable'); } }));
  await expectSanitized(async () => ({ getUser: async () => ({ user: null, error: { message: 'secret auth error' } }), rpc: async () => { throw new Error('unreachable'); } }));
  await expectSanitized(async () => ({ getUser: async () => ({ user: {}, error: null }), rpc: async () => { throw new Error('secret SQL stack'); } }));
  await expectSanitized(async () => ({ getUser: async () => ({ user: {}, error: null }), rpc: async () => ({ data: null, error: { message: 'unknown constraint secret' } }) }));
  console.log('Phase 2F-C3 checkpoint service failure tests passed');
}

void main();
