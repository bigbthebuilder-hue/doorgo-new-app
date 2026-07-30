import assert from 'node:assert/strict';
import { LEGACY_TRANSFER_MAX_BYTES } from './legacy-transfer-types';
import { legacyTransferFilePreflight, unresolvedTransferBlockers } from './legacy-transfer-import-contract';

assert.deepEqual(legacyTransferFilePreflight({ name: 'legacy.json', size: 100 }), { ok: true });
assert.equal(legacyTransferFilePreflight({ name: 'legacy.txt', size: 100 }).ok, false, 'only JSON files are accepted');
assert.equal(legacyTransferFilePreflight({ name: 'legacy.json', size: 0 }).ok, false, 'empty files are rejected');
assert.equal(legacyTransferFilePreflight({ name: 'legacy.json', size: LEGACY_TRANSFER_MAX_BYTES + 1 }).ok, false, 'size is rejected before parsing');
assert.deepEqual(unresolvedTransferBlockers([
  { code: 'native_header_validation', path: 'job.customer', message: 'Correctable' },
  { code: 'native_line_validation', path: 'lines.0.config', message: 'Correctable' },
  { code: 'source_blocker', path: 'source.identifier', message: 'Immutable blocker' },
]), [{ code: 'source_blocker', path: 'source.identifier', message: 'Immutable blocker' }]);

console.log('Legacy transfer import/review contract tests passed');
