import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const types = read('lib/jobs/legacy-transfer-types.ts');
const validation = read('lib/jobs/legacy-transfer-validation.ts');
const mapping = read('lib/jobs/legacy-transfer-mapping.ts');
const tests = read('lib/jobs/legacy-transfer-contract.test.ts');
const docs = read('docs/legacy-job-transfer-contract.md');

assert.match(types, /LEGACY_TRANSFER_SCHEMA = 'doorgo\.legacy-job-transfer'/);
assert.match(types, /LEGACY_TRANSFER_VERSION = 1/);
assert.match(types, /LEGACY_TRANSFER_DIRECTION = 'legacy-to-native'/);
assert.match(types, /LEGACY_TRANSFER_SOURCE_SYSTEM = 'legacy-doorgo'/);
assert.match(types, /LEGACY_TRANSFER_MAX_BYTES = 1024 \* 1024/);
assert.match(types, /LEGACY_TRANSFER_MAX_LINES = 250/);
assert.match(types, /internalJobId: null[\s\S]*doorGoReference: null[\s\S]*revision: null/,
  'mapped editor state must remain unsaved and contain no hosted identity');

assert.match(validation, /fingerprintLegacyTransferPayload[\s\S]*createHash\('sha256'\)/,
  'source provenance must use deterministic SHA-256');
assert.match(validation, /invalid_direction[\s\S]*Only legacy-to-native transfer is allowed/);
assert.match(validation, /ineligible_source_job[\s\S]*Archived or deleted legacy jobs cannot be transferred/);
assert.match(validation, /line\.line_state !== 'active'/);
assert.match(validation, /duplicate_line_id[\s\S]*duplicate_line_index/);
assert.match(validation, /hasDuplicateJsonKeys[\s\S]*duplicate_json_key/);
assert.match(validation, /inspectJsonStructure[\s\S]*payload_too_deep[\s\S]*invalid_prototype/);
assert.match(validation, /payload_too_large/);
assert.match(validation, /too_many_lines/);
assert.match(validation, /FORBIDDEN_KEY[\s\S]*SECRET_TEXT[\s\S]*UNSAFE_TEXT|UNSAFE_TEXT[\s\S]*SECRET_TEXT[\s\S]*FORBIDDEN_KEY/);
assert.doesNotMatch(validation, /supabase|\.rpc\(|fetch\(|createJobIntakeRepository|JobIntakeRepository/,
  'validation must remain pure and repository-free');

assert.match(mapping, /saved: false, internalJobId: null, doorGoReference: null, revision: null/);
assert.match(mapping, /primaryIdentifier: identifier\(payload\)/,
  'all legacy identifier kinds must use the unified primary identifier presentation');
assert.match(mapping, /glassWorkorderDetail: null[\s\S]*glassUnits: \[\], glassCalc: null/,
  'calculated legacy glass output must never be mapped');
assert.doesNotMatch(mapping, /supabase|\.rpc\(|fetch\(|createJobIntakeRepository|repository\.(?:create|update|archive)|p_origin/,
  'mapping must not persist, call hosted services, or construct an RPC request');

for (const evidence of [
  'biztrack_sales_order', 'door_go_reference', 'legacy_job_id', 'ineligible_source_job',
  'invalid_line_state', 'invalid_direction', 'invalid_source', 'identifier_mismatch', 'unknown_key',
  'duplicate_line_id', 'duplicate_line_index', 'not_applicable', 'unsupported_glass_input',
  'forbidden_command', 'secret_material', 'payload_too_large', 'too_many_lines',
  'fingerprint_mismatch', 'maps deterministically',
]) assert.ok(tests.includes(evidence), `Focused transfer test evidence is missing: ${evidence}`);

assert.match(docs, /workflow is deliberately manual and one-way/i);
assert.match(docs, /legacy DoorGo application into an unsaved native DoorGo editor/i);
assert.match(docs, /Native and transferred-native jobs remain invisible and unreadable in legacy DoorGo/);
assert.match(docs, /downloaded UTF-8 JSON file[\s\S]*clipboard transport is not part of this phase/i);
assert.match(docs, /Maximum UTF-8 payload: 1 MiB; maximum 250 line entries/);
assert.match(docs, /Generated `JOB-####`[\s\S]*unified primary identifier/);
assert.match(docs, /neither exports nor invents archived line history/);
assert.match(docs, /Hosted persistence acceptance is complete/);
assert.match(docs, /sequence remained at 13/);
assert.match(docs, /no transferred job persisted/);
assert.match(docs, /native file-import, unsaved review, and dedicated transfer-create adapter are implemented locally/);
assert.match(docs, /no hosted transfer acceptance has occurred/);
assert.match(docs, /Legacy exporter:[\s\S]*unimplemented/);

for (const source of [types, validation, mapping, tests]) {
  assert.doesNotMatch(source, /production booking|calendar event|document move|send email/i,
    'pure transfer modules must not implement operational instructions');
}

console.log('Legacy job transfer static contract verification passed');
