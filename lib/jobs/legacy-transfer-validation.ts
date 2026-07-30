import { createHash } from 'node:crypto';
import {
  LEGACY_TRANSFER_DIRECTION,
  LEGACY_TRANSFER_MAX_BYTES,
  LEGACY_TRANSFER_MAX_LINES,
  LEGACY_TRANSFER_SCHEMA,
  LEGACY_TRANSFER_SOURCE_SYSTEM,
  LEGACY_TRANSFER_VERSION,
  type LegacyJobTransferPayloadV1,
  type LegacyTransferIssue,
  type LegacyTransferValidation,
} from './legacy-transfer-types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UNSAFE_TEXT = /<\/?[a-z][^>]*>|javascript\s*:|<script|on(?:load|error|click)\s*=|^\s*=/i;
const SECRET_TEXT = /(?:bearer\s+[a-z0-9._-]+|api[_ -]?key\s*[:=]|password\s*[:=]|secret\s*[:=]|eyJ[a-z0-9_-]+\.)/i;
const FORBIDDEN_KEY = /(?:auth|credential|password|secret|token|api_?key|production_?(?:booking|command)|calendar_?(?:event|command)|scheduling_?command|document_?move|email_?command|send_?command|delete_?command|archive_?command|executable|dynamic_?instruction)/i;

const TOP_KEYS = ['schema','version','direction','export_id','exported_at','source','job','lines','review_evidence'];
const SOURCE_KEYS = ['system','job_state','identifier_kind','identifier_value','saved_at','source_fingerprint'];
const JOB_KEYS = ['customer','site_address','phone','email','salesperson','po_numbers','notes','hinge_color','lifecycle_stage','delivery_date','customer_pickup_date','fulfillment_plan','shop_date','shop_date_source','shop_hours','shop_hours_source'];
const LINE_KEYS = ['transfer_line_id','source_line_index','line_state','fields','review_evidence'];
const LINE_FIELD_KEYS = ['mode','door_type','config','width','height','custom_slab','custom_slab_width','custom_slab_height','hand','prep','jamb_width','jamb_type','sill','weatherstrip','hinge_type','notes','qty','ro_width','ro_height','material','door_thickness','rip_jamb','glass_inputs'];
const EVIDENCE_KEYS = ['code','field','message','severity'];
const GLASS_KEYS = ['status','sidelight_type','sidelight_glass','transom_glass','sidelight_measurement_left','sidelight_measurement_right','panel_sidelight_width'];

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function inspectJsonStructure(value: unknown, path: string, depth: number, issues: LegacyTransferIssue[]): void {
  if (depth > 12) {
    issues.push({ code: 'payload_too_deep', path, message: 'Transfer payload exceeds the maximum JSON depth.' });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectJsonStructure(entry, `${path}.${index}`, depth + 1, issues));
    return;
  }
  if (!object(value)) return;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) issues.push({ code: 'invalid_prototype', path, message: 'Transfer objects must be plain JSON objects.' });
  for (const [key, entry] of Object.entries(value)) inspectJsonStructure(entry, `${path}.${key}`, depth + 1, issues);
}

function hasDuplicateJsonKeys(source: string): boolean {
  let cursor = 0;
  const whitespace = () => { while (/\s/.test(source[cursor] ?? '')) cursor += 1; };
  const stringValue = (): string => {
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      if (source[cursor] === '\\') { cursor += 2; continue; }
      if (source[cursor] === '"') { cursor += 1; return JSON.parse(source.slice(start, cursor)) as string; }
      cursor += 1;
    }
    throw new Error('unterminated string');
  };
  const value = (): boolean => {
    whitespace();
    if (source[cursor] === '{') {
      cursor += 1; whitespace();
      const keys = new Set<string>();
      if (source[cursor] === '}') { cursor += 1; return false; }
      while (cursor < source.length) {
        whitespace();
        const key = stringValue();
        if (keys.has(key)) return true;
        keys.add(key); whitespace();
        if (source[cursor] !== ':') throw new Error('missing colon');
        cursor += 1;
        if (value()) return true;
        whitespace();
        if (source[cursor] === '}') { cursor += 1; return false; }
        if (source[cursor] !== ',') throw new Error('missing comma');
        cursor += 1;
      }
    }
    if (source[cursor] === '[') {
      cursor += 1; whitespace();
      if (source[cursor] === ']') { cursor += 1; return false; }
      while (cursor < source.length) {
        if (value()) return true;
        whitespace();
        if (source[cursor] === ']') { cursor += 1; return false; }
        if (source[cursor] !== ',') throw new Error('missing comma');
        cursor += 1;
      }
    }
    if (source[cursor] === '"') { stringValue(); return false; }
    while (cursor < source.length && !/[\s,\]}]/.test(source[cursor])) cursor += 1;
    return false;
  };
  try { return value(); } catch { return false; }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function canonicalLegacyTransferFingerprintInput(payload: LegacyJobTransferPayloadV1): string {
  return JSON.stringify(stable({
    schema: payload.schema,
    version: payload.version,
    direction: payload.direction,
    source: {
      system: payload.source.system,
      job_state: payload.source.job_state,
      identifier_kind: payload.source.identifier_kind,
      identifier_value: payload.source.identifier_value,
      saved_at: payload.source.saved_at,
    },
    job: payload.job,
    lines: payload.lines.map(({ review_evidence: _reviewEvidence, ...line }) => line),
  }));
}

export function fingerprintLegacyTransferPayload(payload: LegacyJobTransferPayloadV1): string {
  return createHash('sha256').update(canonicalLegacyTransferFingerprintInput(payload), 'utf8').digest('hex');
}

function exactKeys(value: unknown, allowed: readonly string[], path: string, issues: LegacyTransferIssue[]): value is Record<string, unknown> {
  if (!object(value)) {
    issues.push({ code: 'invalid_object', path, message: `${path} must be an object.` });
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push({ code: 'unknown_key', path: `${path}.${key}`, message: 'Unknown transfer fields are not allowed.' });
    if (FORBIDDEN_KEY.test(key)) issues.push({ code: 'forbidden_command', path: `${path}.${key}`, message: 'Operational, authentication, or executable fields are prohibited.' });
  }
  for (const key of allowed) if (!(key in value)) issues.push({ code: 'missing_key', path: `${path}.${key}`, message: 'Required transfer field is missing.' });
  return true;
}

function validInstant(value: unknown): boolean {
  return typeof value === 'string' && ISO_INSTANT.test(value) && Number.isFinite(Date.parse(value));
}

function validDate(value: unknown): boolean {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function inspectText(value: unknown, path: string, max: number, issues: LegacyTransferIssue[]): void {
  if (typeof value !== 'string') {
    issues.push({ code: 'invalid_text', path, message: 'Expected text.' });
    return;
  }
  if (new TextEncoder().encode(value).length > max) issues.push({ code: 'text_too_long', path, message: `Text exceeds the ${max}-byte limit.` });
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || UNSAFE_TEXT.test(value)) issues.push({ code: 'unsafe_text', path, message: 'HTML, scripts, formulas, and executable text are prohibited.' });
  if (SECRET_TEXT.test(value)) issues.push({ code: 'secret_material', path, message: 'Credentials, tokens, and secrets are prohibited.' });
}

function reviewEvidence(value: unknown, path: string, issues: LegacyTransferIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ code: 'invalid_evidence', path, message: 'Review evidence must be an array.' });
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${path}.${index}`;
    if (!exactKeys(entry, EVIDENCE_KEYS, entryPath, issues)) return;
    inspectText(entry.code, `${entryPath}.code`, 64, issues);
    inspectText(entry.field, `${entryPath}.field`, 128, issues);
    inspectText(entry.message, `${entryPath}.message`, 500, issues);
    if (entry.severity !== 'warning' && entry.severity !== 'blocker') issues.push({ code: 'invalid_enum', path: `${entryPath}.severity`, message: 'Evidence severity must be warning or blocker.' });
  });
}

function transferField(value: unknown, path: string, issues: LegacyTransferIssue[], inspectValue: (fieldValue: unknown, fieldPath: string) => void): void {
  if (!object(value) || !['value','missing','not_applicable'].includes(String(value.state))) {
    issues.push({ code: 'invalid_field_state', path, message: 'Field state must be value, missing, or not_applicable.' });
    return;
  }
  const allowed = value.state === 'value' ? ['state','value','source_value'] : ['state','source_value'];
  exactKeys(value, allowed, path, issues);
  if (value.state === 'value') {
    inspectValue(value.value, `${path}.value`);
    inspectValue(value.source_value, `${path}.source_value`);
  } else if (value.source_value !== null) {
    issues.push({ code: 'invalid_source_value', path: `${path}.source_value`, message: 'Missing and not-applicable fields require a null source value.' });
  }
}

function textField(value: unknown, path: string, max: number, issues: LegacyTransferIssue[]): void {
  transferField(value, path, issues, (fieldValue, fieldPath) => inspectText(fieldValue, fieldPath, max, issues));
}

function enumField(value: unknown, path: string, allowed: readonly string[], issues: LegacyTransferIssue[]): void {
  transferField(value, path, issues, (fieldValue, fieldPath) => {
    if (typeof fieldValue !== 'string' || !allowed.includes(fieldValue)) issues.push({ code: 'invalid_enum', path: fieldPath, message: `Expected one of: ${allowed.join(', ')}.` });
  });
}

function dateField(value: unknown, path: string, issues: LegacyTransferIssue[]): void {
  transferField(value, path, issues, (fieldValue, fieldPath) => {
    if (!validDate(fieldValue)) issues.push({ code: 'invalid_date', path: fieldPath, message: 'Expected a real YYYY-MM-DD date.' });
  });
}

function glassField(value: unknown, path: string, issues: LegacyTransferIssue[]): void {
  transferField(value, path, issues, (fieldValue, fieldPath) => {
    if (!exactKeys(fieldValue, GLASS_KEYS, fieldPath, issues)) return;
    if (!['supported','needs_review','unsupported'].includes(String(fieldValue.status))) issues.push({ code: 'invalid_enum', path: `${fieldPath}.status`, message: 'Invalid glass input status.' });
    if (![null,'Glass','Panel'].includes(fieldValue.sidelight_type as null | string)) issues.push({ code: 'invalid_enum', path: `${fieldPath}.sidelight_type`, message: 'Invalid sidelight type.' });
    for (const key of GLASS_KEYS.slice(2)) if (fieldValue[key] !== null) inspectText(fieldValue[key], `${fieldPath}.${key}`, 500, issues);
  });
}

function validatePayloadShape(raw: unknown, issues: LegacyTransferIssue[]): raw is LegacyJobTransferPayloadV1 {
  if (!exactKeys(raw, TOP_KEYS, '$', issues)) return false;
  if (raw.schema !== LEGACY_TRANSFER_SCHEMA) issues.push({ code: 'invalid_schema', path: '$.schema', message: 'Unsupported transfer schema.' });
  if (raw.version !== LEGACY_TRANSFER_VERSION) issues.push({ code: 'invalid_version', path: '$.version', message: 'Unsupported transfer version.' });
  if (raw.direction !== LEGACY_TRANSFER_DIRECTION) issues.push({ code: 'invalid_direction', path: '$.direction', message: 'Only legacy-to-native transfer is allowed.' });
  if (!UUID.test(String(raw.export_id))) issues.push({ code: 'invalid_uuid', path: '$.export_id', message: 'Export ID must be a UUID.' });
  if (!validInstant(raw.exported_at)) issues.push({ code: 'invalid_timestamp', path: '$.exported_at', message: 'Export timestamp must be an ISO UTC instant.' });

  if (exactKeys(raw.source, SOURCE_KEYS, '$.source', issues)) {
    if (raw.source.system !== LEGACY_TRANSFER_SOURCE_SYSTEM) issues.push({ code: 'invalid_source', path: '$.source.system', message: 'Native or unknown source payloads are prohibited.' });
    if (raw.source.job_state !== 'active') issues.push({ code: 'ineligible_source_job', path: '$.source.job_state', message: 'Archived or deleted legacy jobs cannot be transferred.' });
    if (!['biztrack_sales_order','door_go_reference','legacy_job_id'].includes(String(raw.source.identifier_kind))) issues.push({ code: 'invalid_identifier_kind', path: '$.source.identifier_kind', message: 'Unknown identifier kinds require explicit classification.' });
    inspectText(raw.source.identifier_value, '$.source.identifier_value', 100, issues);
    const identifier = String(raw.source.identifier_value ?? '');
    if (raw.source.identifier_kind === 'door_go_reference' && !/^DG-[0-9]{6}$/.test(identifier)) issues.push({ code: 'identifier_mismatch', path: '$.source.identifier_value', message: 'DoorGo references must match DG-######.' });
    if (raw.source.identifier_kind === 'legacy_job_id' && !/^JOB-[0-9]{4,}$/.test(identifier)) issues.push({ code: 'identifier_mismatch', path: '$.source.identifier_value', message: 'Legacy job IDs must match JOB-#### or longer.' });
    if (raw.source.identifier_kind === 'biztrack_sales_order' && (/^DG-/i.test(identifier) || /^JOB-/i.test(identifier))) issues.push({ code: 'identifier_mismatch', path: '$.source.identifier_value', message: 'DG and JOB identifiers cannot be reinterpreted as Sales Orders.' });
    if (!validInstant(raw.source.saved_at)) issues.push({ code: 'invalid_timestamp', path: '$.source.saved_at', message: 'Source saved timestamp must be an ISO UTC instant.' });
    if (!SHA256.test(String(raw.source.source_fingerprint))) issues.push({ code: 'invalid_fingerprint', path: '$.source.source_fingerprint', message: 'Source fingerprint must be lowercase SHA-256.' });
  }

  if (exactKeys(raw.job, JOB_KEYS, '$.job', issues)) {
    const job = raw.job;
    for (const key of ['customer','site_address']) textField(job[key], `$.job.${key}`, 300, issues);
    for (const key of ['phone','email','salesperson','hinge_color','shop_date_source','shop_hours_source']) textField(job[key], `$.job.${key}`, 254, issues);
    textField(job.notes, '$.job.notes', 10000, issues);
    enumField(job.lifecycle_stage, '$.job.lifecycle_stage', ['Draft','Confirmed Job'], issues);
    enumField(job.fulfillment_plan, '$.job.fulfillment_plan', ['Delivery','Customer Pickup'], issues);
    for (const key of ['delivery_date','customer_pickup_date','shop_date']) dateField(job[key], `$.job.${key}`, issues);
    transferField(job.shop_hours, '$.job.shop_hours', issues, (value, path) => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || Math.round(value * 4) !== value * 4) issues.push({ code: 'invalid_hours', path, message: 'Shop hours must be a non-negative quarter-hour number.' });
    });
    transferField(job.po_numbers, '$.job.po_numbers', issues, (value, path) => {
      if (!Array.isArray(value) || value.length > 25 || value.some((entry) => typeof entry !== 'string' || !/^\d{1,50}$/.test(entry))) issues.push({ code: 'invalid_po_numbers', path, message: 'PO numbers must be a list of at most 25 digit-only values.' });
    });
  }

  if (!Array.isArray(raw.lines)) issues.push({ code: 'invalid_lines', path: '$.lines', message: 'Lines must be an array.' });
  else {
    if (raw.lines.length > LEGACY_TRANSFER_MAX_LINES) issues.push({ code: 'too_many_lines', path: '$.lines', message: `No more than ${LEGACY_TRANSFER_MAX_LINES} lines are allowed.` });
    const ids = new Set<string>(), indexes = new Set<number>();
    raw.lines.forEach((line, index) => {
      const path = `$.lines.${index}`;
      if (!exactKeys(line, LINE_KEYS, path, issues)) return;
      if (!UUID.test(String(line.transfer_line_id))) issues.push({ code: 'invalid_uuid', path: `${path}.transfer_line_id`, message: 'Transfer line ID must be a UUID.' });
      if (ids.has(String(line.transfer_line_id))) issues.push({ code: 'duplicate_line_id', path: `${path}.transfer_line_id`, message: 'Transfer line IDs must be unique.' });
      ids.add(String(line.transfer_line_id));
      if (!Number.isInteger(line.source_line_index) || Number(line.source_line_index) < 1) issues.push({ code: 'invalid_line_index', path: `${path}.source_line_index`, message: 'Line index must be a positive integer.' });
      if (line.source_line_index !== index + 1) issues.push({ code: 'invalid_line_order', path: `${path}.source_line_index`, message: 'Source line indexes must be contiguous and match payload order.' });
      if (indexes.has(Number(line.source_line_index))) issues.push({ code: 'duplicate_line_index', path: `${path}.source_line_index`, message: 'Source line indexes must be unique.' });
      indexes.add(Number(line.source_line_index));
      if (line.line_state !== 'active') issues.push({ code: 'invalid_line_state', path: `${path}.line_state`, message: 'Legacy exports contain active lines only.' });
      reviewEvidence(line.review_evidence, `${path}.review_evidence`, issues);
      if (!exactKeys(line.fields, LINE_FIELD_KEYS, `${path}.fields`, issues)) return;
      const fields = line.fields;
      enumField(fields.mode, `${path}.fields.mode`, ['Interior','Exterior'], issues);
      for (const key of LINE_FIELD_KEYS.filter((key) => !['mode','qty','glass_inputs'].includes(key))) textField(fields[key], `${path}.fields.${key}`, key === 'notes' ? 2000 : 500, issues);
      transferField(fields.qty, `${path}.fields.qty`, issues, (value, fieldPath) => {
        if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 999) issues.push({ code: 'invalid_quantity', path: fieldPath, message: 'Quantity must be a whole number from 1 through 999.' });
      });
      glassField(fields.glass_inputs, `${path}.fields.glass_inputs`, issues);
    });
  }
  reviewEvidence(raw.review_evidence, '$.review_evidence', issues);
  return true;
}

export function validateLegacyTransferPayload(input: string | unknown): LegacyTransferValidation {
  let raw: unknown = input;
  let encodedBytes = 0;
  if (typeof input === 'string') {
    encodedBytes = new TextEncoder().encode(input).length;
    if (encodedBytes > LEGACY_TRANSFER_MAX_BYTES) return { ok: false, encodedBytes, issues: [{ code: 'payload_too_large', path: '$', message: 'Transfer payload exceeds 1 MiB.' }] };
    try { raw = JSON.parse(input); } catch { return { ok: false, encodedBytes, issues: [{ code: 'invalid_json', path: '$', message: 'Transfer payload is not valid JSON.' }] }; }
    if (hasDuplicateJsonKeys(input)) return { ok: false, encodedBytes, issues: [{ code: 'duplicate_json_key', path: '$', message: 'Duplicate JSON keys are prohibited.' }] };
  } else {
    try { encodedBytes = new TextEncoder().encode(JSON.stringify(input)).length; } catch { return { ok: false, encodedBytes: 0, issues: [{ code: 'invalid_json', path: '$', message: 'Transfer payload is not JSON serializable.' }] }; }
    if (encodedBytes > LEGACY_TRANSFER_MAX_BYTES) return { ok: false, encodedBytes, issues: [{ code: 'payload_too_large', path: '$', message: 'Transfer payload exceeds 1 MiB.' }] };
  }
  const issues: LegacyTransferIssue[] = [];
  inspectJsonStructure(raw, '$', 0, issues);
  if (!validatePayloadShape(raw, issues)) return { ok: false, issues, encodedBytes };
  const payload = raw as LegacyJobTransferPayloadV1;
  if (issues.length === 0 && fingerprintLegacyTransferPayload(payload) !== payload.source.source_fingerprint) issues.push({ code: 'fingerprint_mismatch', path: '$.source.source_fingerprint', message: 'Source fingerprint does not match the authoritative payload.' });
  return issues.length ? { ok: false, issues, encodedBytes } : { ok: true, payload, encodedBytes };
}
