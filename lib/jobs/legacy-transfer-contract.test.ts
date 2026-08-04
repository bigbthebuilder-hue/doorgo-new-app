import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapLegacyTransferToUnsavedEditor } from './legacy-transfer-mapping';
import {
  LEGACY_TRANSFER_MAX_BYTES,
  LEGACY_TRANSFER_MAX_LINES,
  type LegacyJobTransferPayloadV1,
  type LegacyTransferField,
  type LegacyTransferLine,
} from './legacy-transfer-types';
import { fingerprintLegacyTransferPayload, validateLegacyTransferPayload } from './legacy-transfer-validation';

const value = <T>(entry: T): LegacyTransferField<T> => ({ state: 'value', value: entry, source_value: entry });
const missing = <T>(): LegacyTransferField<T> => ({ state: 'missing', source_value: null });
const notApplicable = <T>(): LegacyTransferField<T> => ({ state: 'not_applicable', source_value: null });
const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

function baseLine(index = 1): LegacyTransferLine {
  return {
    transfer_line_id: uuid(index), source_line_index: index, line_state: 'active', review_evidence: [],
    fields: {
      mode: value('Interior'), door_type: value('Madison H/C'), config: value('D'), width: value(`2'6"`), height: value(`6'8"`),
      custom_slab: value('No'), custom_slab_width: notApplicable(), custom_slab_height: notApplicable(),
      hand: value('LH'), prep: value('YES'), jamb_width: value(`4-9/16"`), jamb_type: value('Primed'),
      sill: notApplicable(), weatherstrip: notApplicable(), hinge_type: value('REG'), notes: missing(), qty: value(1),
      ro_width: missing(), ro_height: missing(), material: value('wood'), door_thickness: missing(), rip_jamb: missing(),
      glass_inputs: notApplicable(),
    },
  };
}

function payload(kind: LegacyJobTransferPayloadV1['source']['identifier_kind'] = 'biztrack_sales_order', identifier = 'SO-100'): LegacyJobTransferPayloadV1 {
  const result: LegacyJobTransferPayloadV1 = {
    schema: 'doorgo.legacy-job-transfer', version: 1, direction: 'legacy-to-native',
    export_id: uuid(999), exported_at: '2026-07-30T10:00:00.000Z',
    source: { system: 'legacy-doorgo', job_state: 'active', identifier_kind: kind, identifier_value: identifier, saved_at: '2026-07-30T09:30:00.000Z', source_fingerprint: '0'.repeat(64) },
    job: {
      customer: value('NON-PRODUCTION TEST'), site_address: missing(), phone: missing(), email: missing(),
      salesperson: value('Barrett'), po_numbers: value(['12345']), notes: value('DO NOT BUILD OR SCHEDULE'),
      hinge_color: missing(), lifecycle_stage: value('Draft'), delivery_date: missing(), customer_pickup_date: notApplicable(),
      fulfillment_plan: missing(), shop_date: missing(), shop_date_source: missing(), shop_hours: value(0.25), shop_hours_source: value('Manual'),
    },
    lines: [baseLine()], review_evidence: [],
  };
  result.source.source_fingerprint = fingerprintLegacyTransferPayload(result);
  return result;
}

function clone<T>(entry: T): T { return JSON.parse(JSON.stringify(entry)) as T; }
function resign(entry: LegacyJobTransferPayloadV1): LegacyJobTransferPayloadV1 {
  entry.source.source_fingerprint = fingerprintLegacyTransferPayload(entry);
  return entry;
}
function issueCodes(entry: unknown): string[] {
  const result = validateLegacyTransferPayload(entry);
  if (result.ok === false) return result.issues.map((issue) => issue.code);
  return [];
}

assert.equal(validateLegacyTransferPayload(readFileSync('tests/fixtures/legacy-transfer-job-0065.json', 'utf8')).ok, true, 'manual acceptance fixture remains valid');

{
  const evidencePayload = payload();
  evidencePayload.lines = [baseLine(1), baseLine(2)];
  const repeated = { code: 'glass_review', field: 'glass_inputs', message: 'Review glass evidence.', severity: 'warning' as const };
  evidencePayload.lines[0].review_evidence.push(repeated, { ...repeated }, { ...repeated, message: 'Confirm first-line glass.' });
  evidencePayload.lines[1].review_evidence.push({ ...repeated });
  const mapped = mapLegacyTransferToUnsavedEditor(resign(evidencePayload));
  assert.equal(mapped.ok, true);
  if (mapped.ok) {
    assert.equal(mapped.warnings.filter((issue) => issue.message === repeated.message).length, 2, 'one exact warning remains for each distinct line scope');
    assert.ok(mapped.warnings.some((issue) => issue.path === 'lines.0.glass_inputs'));
    assert.ok(mapped.warnings.some((issue) => issue.path === 'lines.1.glass_inputs'));
    assert.ok(mapped.warnings.some((issue) => issue.message === 'Confirm first-line glass.'), 'distinct wording on the same field remains visible');
  }
}

for (const [kind, identifier, label] of [
  ['biztrack_sales_order', 'SO-100', 'Sales Order'],
  ['door_go_reference', 'DG-000002', 'DoorGo Reference'],
  ['legacy_job_id', 'JOB-0065', 'Legacy Job ID'],
] as const) {
  const mapped = mapLegacyTransferToUnsavedEditor(payload(kind, identifier));
  assert.equal(mapped.ok, true, `${kind} payload maps`);
  if (mapped.ok) {
    assert.deepEqual(mapped.editor.primaryIdentifier, { kind, value: identifier, label });
    assert.equal(mapped.editor.saved, false);
    assert.equal(mapped.editor.internalJobId, null);
    assert.equal(mapped.editor.doorGoReference, null, 'transfer mapping never allocates a DG reference');
    assert.equal('legacyJobId' in mapped.editor.header, false, 'no extra legacy-ID editor field is introduced');
    assert.equal(mapped.editor.header.bizTrackSalesOrder, kind === 'biztrack_sales_order' ? identifier : null);
  }
}

{
  const archived = clone(payload()); (archived.source as { job_state: string }).job_state = 'archived';
  assert.ok(issueCodes(resign(archived)).includes('ineligible_source_job'));
  const deleted = clone(payload()); (deleted.source as { job_state: string }).job_state = 'deleted';
  assert.ok(issueCodes(resign(deleted)).includes('ineligible_source_job'));
  const archivedLine = clone(payload()); (archivedLine.lines[0] as { line_state: string }).line_state = 'archived';
  assert.ok(issueCodes(resign(archivedLine)).includes('invalid_line_state'));
}

{
  const reverse = clone(payload()); (reverse as { direction: string }).direction = 'native-to-legacy';
  assert.ok(issueCodes(resign(reverse)).includes('invalid_direction'));
  const native = clone(payload()); (native.source as { system: string }).system = 'native-doorgo';
  assert.ok(issueCodes(resign(native)).includes('invalid_source'));
  const unknown = clone(payload('legacy_job_id', 'JOB-0065')); unknown.source.identifier_value = 'MYSTERY-1';
  assert.ok(issueCodes(resign(unknown)).includes('identifier_mismatch'));
  const disguised = clone(payload()); disguised.source.identifier_value = 'JOB-0065';
  assert.ok(issueCodes(resign(disguised)).includes('identifier_mismatch'));
}

{
  const unknown = clone(payload()) as LegacyJobTransferPayloadV1 & { unexpected?: string }; unknown.unexpected = 'x';
  assert.ok(issueCodes(resign(unknown)).includes('unknown_key'));
  const nested = clone(payload()) as LegacyJobTransferPayloadV1; (nested.lines[0].fields as unknown as Record<string, unknown>).calendar_event = 'create';
  const nestedCodes = issueCodes(resign(nested));
  assert.ok(nestedCodes.includes('unknown_key') && nestedCodes.includes('forbidden_command'));
  const serialized = JSON.stringify(payload());
  const duplicateKey = serialized.replace('"schema":"doorgo.legacy-job-transfer"', '"schema":"doorgo.legacy-job-transfer","schema":"doorgo.legacy-job-transfer"');
  assert.ok(issueCodes(duplicateKey).includes('duplicate_json_key'));
}

{
  const duplicateId = clone(payload()); duplicateId.lines.push({ ...baseLine(2), transfer_line_id: duplicateId.lines[0].transfer_line_id });
  assert.ok(issueCodes(resign(duplicateId)).includes('duplicate_line_id'));
  const duplicateIndex = clone(payload()); duplicateIndex.lines.push({ ...baseLine(2), source_line_index: 1 });
  assert.ok(issueCodes(resign(duplicateIndex)).includes('duplicate_line_index'));
  const wrongOrder = clone(payload()); wrongOrder.lines[0].source_line_index = 2;
  assert.ok(issueCodes(resign(wrongOrder)).includes('invalid_line_order'));
}

{
  const blocker = payload();
  blocker.review_evidence.push({ code: 'manual_review_blocker', field: 'job.customer', message: 'Confirm this source value.', severity: 'blocker' });
  const mapped = mapLegacyTransferToUnsavedEditor(resign(blocker));
  assert.equal(mapped.ok, true, 'safe fields remain reviewable when declared blockers prevent Save');
  if (mapped.ok) {
    assert.equal(mapped.editor.saved, false);
    assert.equal(mapped.blockers.length, 1);
  }
}

{
  const invalidEnum = payload(); invalidEnum.lines[0].fields.config = value('UNKNOWN');
  const mapped = mapLegacyTransferToUnsavedEditor(resign(invalidEnum));
  assert.equal(mapped.ok, true);
  if (mapped.ok) assert.ok(mapped.blockers.some((issue) => issue.code === 'native_line_validation' && issue.path.endsWith('.config')), 'invalid native enums block Save');
}

{
  const mapped = mapLegacyTransferToUnsavedEditor(payload());
  assert.equal(mapped.ok, true);
  if (mapped.ok) {
    assert.equal(mapped.provenance.sourceJobFields.site_address.state, 'missing');
    assert.equal(mapped.provenance.sourceJobFields.customer_pickup_date.state, 'not_applicable');
  }
}

{
  const glass = clone(payload());
  glass.lines[0].fields.mode = value('Exterior'); glass.lines[0].fields.config = value('SD');
  glass.lines[0].fields.width = value(`3'0"`); glass.lines[0].fields.material = value('fiberglass');
  glass.lines[0].fields.prep = value('STD'); glass.lines[0].fields.jamb_width = value(`6-9/16"`);
  glass.lines[0].fields.hinge_type = value('BB'); glass.lines[0].fields.sill = value('STD'); glass.lines[0].fields.weatherstrip = value('WHT');
  glass.lines[0].fields.ro_width = value(`64"`); glass.lines[0].fields.glass_inputs = value({ status: 'needs_review', sidelight_type: 'Glass', sidelight_glass: 'Clear', transom_glass: null, sidelight_measurement_left: null, sidelight_measurement_right: null, panel_sidelight_width: null });
  glass.lines[0].review_evidence.push({ code: 'unsupported_glass_input', field: 'lines.0.glass_inputs', message: 'Rebuild glass detail in native editor.', severity: 'warning' });
  const mapped = mapLegacyTransferToUnsavedEditor(resign(glass));
  assert.equal(mapped.ok, true);
  if (mapped.ok) {
    assert.ok(mapped.unsupportedFields.includes('lines.0.glass_inputs'));
    assert.equal(mapped.editor.lines[0].glassCalcStatus, 'Glass Detail Needed');
    assert.deepEqual(mapped.editor.lines[0].glassUnits, []);
    assert.equal(mapped.editor.lines[0].glassCalc, null, 'legacy calculated glass output is never mapped');
  }
}

{
  const operational = clone(payload()) as LegacyJobTransferPayloadV1; (operational.job as unknown as Record<string, unknown>).production_booking_command = { create: true };
  assert.ok(issueCodes(resign(operational)).includes('forbidden_command'));
  for (const key of ['calendar_event_command','scheduling_command','document_move_command','email_command','delete_command','archive_command','dynamic_instruction']) {
    const command = clone(payload()); (command.job as unknown as Record<string, unknown>)[key] = { execute: true };
    assert.ok(issueCodes(resign(command)).includes('forbidden_command'), `${key} is rejected`);
  }
  for (const unsafe of ['<script>alert(1)</script>', 'RESEND_API_KEY=private', 'Bearer eyJprivate.token.value']) {
    const secret = clone(payload()); secret.job.notes = value(unsafe);
    const codes = issueCodes(resign(secret));
    assert.ok(codes.includes('unsafe_text') || codes.includes('secret_material'));
  }
}

{
  const invalidDate = payload(); invalidDate.job.delivery_date = value('2026-02-30');
  assert.ok(issueCodes(resign(invalidDate)).includes('invalid_date'));
  const invalidMode = payload(); (invalidMode.lines[0].fields.mode as unknown as { value: string; source_value: string }).value = 'Factory';
  (invalidMode.lines[0].fields.mode as unknown as { value: string; source_value: string }).source_value = 'Factory';
  assert.ok(issueCodes(resign(invalidMode)).includes('invalid_enum'));
}

{
  const tooMany = payload(); tooMany.lines = Array.from({ length: LEGACY_TRANSFER_MAX_LINES + 1 }, (_, index) => baseLine(index + 1));
  assert.ok(issueCodes(resign(tooMany)).includes('too_many_lines'));
  const oversized = JSON.stringify({ ...payload(), padding: 'x'.repeat(LEGACY_TRANSFER_MAX_BYTES) });
  const result = validateLegacyTransferPayload(oversized);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((issue) => issue.code === 'payload_too_large'));
}

{
  const original = payload();
  assert.equal(validateLegacyTransferPayload(original).ok, true);
  const tampered = clone(original); tampered.job.customer = value('Changed after export');
  assert.ok(issueCodes(tampered).includes('fingerprint_mismatch'));
  const first = mapLegacyTransferToUnsavedEditor(original), second = mapLegacyTransferToUnsavedEditor(clone(original));
  assert.deepEqual(first, second, 'the same payload maps deterministically');
  assert.equal(JSON.stringify(original), JSON.stringify(clone(original)), 'pure mapping does not mutate its input');
}

console.log('Legacy transfer payload contract tests passed');
