import assert from 'node:assert/strict';
import { executeCheckpointOperation, mapCheckpointError, validateCheckpointRequest } from './checkpoint-action-contract';

const commandId = '11111111-1111-4111-8111-111111111111';
const expectedId = '22222222-2222-4222-8222-222222222222';
const seriesId = '33333333-3333-4333-8333-333333333333';
const confirm = { commandId, productionDate: '2026-07-12', openingCarryHours: 12.25, calculatedOpeningCarrySnapshot: null, calculationVersion: ' v1 ', note: '  ' };
const revise = { ...confirm, expectedCheckpointId: expectedId, expectedRevisionNumber: 2 };
const remove = { commandId, productionDate: '2026-07-12', expectedCheckpointId: expectedId, expectedRevisionNumber: 2, removalReason: ' correction ' };
const row = (overrides: Record<string, unknown> = {}) => ({ checkpoint_id: commandId, checkpoint_series_id: seriesId, production_date: '2026-07-12', revision_number: 1, checkpoint_status: 'confirmed', supersedes_checkpoint_id: null, superseded_by_checkpoint_id: null, opening_carry_hours: '12.25', calculated_opening_carry_snapshot: null, adjustment_hours_snapshot: null, calculation_version: 'v1', note: null, recorded_at: '2026-07-12T12:00:00Z', confirmed_at: '2026-07-12T12:00:00Z', ...overrides });

for (const [operation, input] of [['confirm', confirm], ['revise', revise], ['remove', remove]] as const) assert.equal(validateCheckpointRequest(operation, input).ok, true);
const normalized = validateCheckpointRequest('confirm', confirm); assert.equal(normalized.ok && normalized.value.note, null); assert.equal(normalized.ok && normalized.value.calculationVersion, 'v1');
for (const value of [0, 0.1, 1.01, 6.25, 99_999_999.99]) assert.equal(validateCheckpointRequest('confirm', { ...confirm, openingCarryHours: value }).ok, true, `${value} must be accepted`);
const zeroSnapshot = validateCheckpointRequest('confirm', { ...confirm, calculatedOpeningCarrySnapshot: 0 }); assert.equal(zeroSnapshot.ok && zeroSnapshot.value.calculatedOpeningCarrySnapshot, 0);
for (const [field, value] of [['commandId', 'bad'], ['productionDate', '2026-02-30'], ['openingCarryHours', -1], ['openingCarryHours', 100_000_000], ['openingCarryHours', 1.001], ['openingCarryHours', Number.NaN], ['openingCarryHours', Number.POSITIVE_INFINITY]] as const) {
  assert.equal(validateCheckpointRequest('confirm', { ...confirm, [field]: value }).ok, false, `${field} must be rejected`);
}
assert.equal(validateCheckpointRequest('confirm', { ...confirm, productionDate: '2099-01-01' }).ok, true, 'future business date remains database-authoritative and unchanged');
assert.equal(validateCheckpointRequest('confirm', { ...confirm, productionDate: '0000-01-01' }).ok, false);
assert.equal(validateCheckpointRequest('confirm', { ...confirm, extra: true }).ok, false);
assert.equal(validateCheckpointRequest('confirm', { ...confirm, note: 'x'.repeat(501) }).ok, false);
assert.equal(validateCheckpointRequest('confirm', { ...confirm, calculationVersion: 'x'.repeat(501) }).ok, false);
assert.equal(validateCheckpointRequest('revise', { ...revise, expectedRevisionNumber: 0 }).ok, false);
assert.equal(validateCheckpointRequest('remove', { ...remove, removalReason: '   ' }).ok, false);

async function run(operation: 'confirm' | 'revise' | 'remove', input: unknown, response: unknown, rpcError: unknown = null) {
  const called: { name: string; parameters: Record<string, unknown> } = { name: '', parameters: {} };
  const result = await executeCheckpointOperation(operation, input, { getUser: async () => ({ user: { id: 'safe' }, error: null }), rpc: async (name, parameters) => { called.name = name; called.parameters = parameters; return { data: response, error: rpcError }; } });
  return { result, called };
}
async function main() {
const confirmed = await run('confirm', confirm, row());
assert.equal(confirmed.result.ok, true); assert.deepEqual(confirmed.called, { name: 'create_production_flow_checkpoint', parameters: { p_checkpoint_id: commandId, p_production_date: '2026-07-12', p_opening_carry_hours: 12.25, p_calculated_opening_carry_snapshot: null, p_calculation_version: 'v1', p_note: null } });
if (confirmed.result.ok) { assert.equal(confirmed.result.checkpoint.openingCarryHours, 12.25); assert.equal(confirmed.result.checkpoint.calculatedOpeningCarrySnapshot, null); assert.equal(confirmed.result.checkpoint.checkpointSeriesId, seriesId); }
const revisedRow = row({ revision_number: 3, supersedes_checkpoint_id: expectedId });
const revised = await run('revise', revise, revisedRow); assert.equal(revised.result.ok, true); assert.equal(revised.called.name, 'revise_production_flow_checkpoint');
assert.deepEqual(revised.called.parameters, { p_new_checkpoint_id: commandId, p_production_date: '2026-07-12', p_expected_checkpoint_id: expectedId, p_expected_revision_number: 2, p_opening_carry_hours: 12.25, p_calculated_opening_carry_snapshot: null, p_calculation_version: 'v1', p_note: null });
const removed = await run('remove', remove, row({ revision_number: 3, checkpoint_status: 'voided', supersedes_checkpoint_id: expectedId, confirmed_at: null, note: 'correction' })); assert.equal(removed.result.ok, true); assert.equal(removed.called.name, 'void_production_flow_checkpoint');
assert.deepEqual(removed.called.parameters, { p_void_checkpoint_id: commandId, p_production_date: '2026-07-12', p_expected_checkpoint_id: expectedId, p_expected_revision_number: 2, p_note: 'correction' });
assert.equal((await run('confirm', confirm, row({ revision_number: 4, supersedes_checkpoint_id: expectedId }))).result.ok, true, 'reconfirm may return a later revision');

for (const value of ['0', '0.10', '6.25', '99999999.99']) assert.equal((await run('confirm', { ...confirm, openingCarryHours: Number(value) }, row({ opening_carry_hours: value }))).result.ok, true, `${value} response must be accepted`);
assert.equal((await run('confirm', confirm, row({ adjustment_hours_snapshot: '-1.50' }))).result.ok, true, 'negative adjustment response must be accepted');
for (const value of ['', ' ', ' 0.10', '0.10 ', '0x10', '1e2', 'NaN', 'Infinity']) assert.equal((await run('confirm', confirm, row({ opening_carry_hours: value }))).result.ok, false, `${JSON.stringify(value)} response must be rejected`);

assert.equal((await run('confirm', confirm, row({ recorded_at: '2026-07-12T12:00:00-07:00' }))).result.ok, true);
assert.equal((await run('confirm', confirm, row({ confirmed_at: null }))).result.ok, true);
for (const value of ['invalid timestamp', '2026-02-30T12:00:00Z', '2026-07-12T12:00:00', '2026-07-12']) assert.equal((await run('confirm', confirm, row({ recorded_at: value }))).result.ok, false, `${value} must be rejected`);

for (const malformed of [null, [], [row(), row()], row({ checkpoint_id: expectedId }), row({ production_date: '2026-07-11' }), row({ opening_carry_hours: 'NaN' }), row({ checkpoint_status: 'unknown' })]) assert.equal((await run('confirm', confirm, malformed)).result.ok, false);
assert.equal((await run('revise', revise, row({ revision_number: 4, supersedes_checkpoint_id: expectedId }))).result.ok, false);
assert.equal((await run('revise', revise, row({ revision_number: 3, supersedes_checkpoint_id: seriesId }))).result.ok, false);
assert.equal((await run('remove', remove, row({ revision_number: 3, supersedes_checkpoint_id: expectedId }))).result.ok, false);
assert.equal((await run('remove', remove, row({ revision_number: 3, checkpoint_status: 'voided', supersedes_checkpoint_id: expectedId }))).result.ok, false);

const known = ['authentication_required', 'active_profile_required', 'permission_required', 'invalid_request', 'future_date_not_allowed', 'invalid_carry_value', 'too_many_decimal_places', 'note_required', 'note_too_long', 'command_uuid_collision', 'already_confirmed', 'not_found', 'stale_revision', 'inconsistent_history'] as const;
for (const code of known) { const result = mapCheckpointError({ message: `checkpoint.${code}` }); assert.equal(result.ok, false); if (result.ok === false) assert.equal(result.code, code); }
for (const message of ['checkpoint.not_found_extra', 'prefix checkpoint.not_found', 'checkpoint.not_found suffix', 'A diagnostic paragraph contains checkpoint.not_found but is not the token.']) assert.deepEqual(mapCheckpointError({ message }), { ok: false, code: 'unavailable', message: 'The checkpoint could not be saved. Please try again.' });
const unknown = mapCheckpointError({ message: 'duplicate key violates constraint secret' }); assert.deepEqual(unknown, { ok: false, code: 'unavailable', message: 'The checkpoint could not be saved. Please try again.' });
const unauthenticated = await executeCheckpointOperation('confirm', confirm, { getUser: async () => ({ user: null, error: null }), rpc: async () => { throw new Error('must not call'); } }); assert.equal(unauthenticated.ok === false && unauthenticated.code, 'authentication_required');

console.log('Phase 2F-C3 checkpoint action contract tests passed');
}

void main();
