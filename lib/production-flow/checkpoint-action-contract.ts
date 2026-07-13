export const CHECKPOINT_RPC_NAMES = {
  confirm: 'create_production_flow_checkpoint',
  revise: 'revise_production_flow_checkpoint',
  remove: 'void_production_flow_checkpoint',
} as const;

export type CheckpointStatus = 'confirmed' | 'superseded' | 'voided';
export type NormalizedProductionFlowCheckpoint = {
  checkpointId: string; checkpointSeriesId: string; productionDate: string;
  revisionNumber: number; status: CheckpointStatus;
  supersedesCheckpointId: string | null; supersededByCheckpointId: string | null;
  openingCarryHours: number; calculatedOpeningCarrySnapshot: number | null;
  adjustmentHoursSnapshot: number | null; calculationVersion: string | null;
  note: string | null; recordedAt: string; confirmedAt: string | null;
};

export type CheckpointErrorCode =
  | 'validation_error' | 'authentication_required' | 'active_profile_required'
  | 'permission_required' | 'invalid_request' | 'future_date_not_allowed'
  | 'invalid_carry_value' | 'too_many_decimal_places' | 'note_required'
  | 'note_too_long' | 'command_uuid_collision' | 'already_confirmed'
  | 'not_found' | 'stale_revision' | 'inconsistent_history'
  | 'malformed_response' | 'unavailable';
export type CheckpointActionResult =
  | { ok: true; checkpoint: NormalizedProductionFlowCheckpoint }
  | { ok: false; code: CheckpointErrorCode; message: string; fieldErrors?: Record<string, string> };

export type ConfirmCheckpointRequest = { commandId: string; productionDate: string; openingCarryHours: number; calculatedOpeningCarrySnapshot?: number | null; calculationVersion?: string | null; note?: string | null };
export type ReviseCheckpointRequest = ConfirmCheckpointRequest & { expectedCheckpointId: string; expectedRevisionNumber: number };
export type RemoveCheckpointRequest = { commandId: string; productionDate: string; expectedCheckpointId: string; expectedRevisionNumber: number; removalReason: string };
type Operation = 'confirm' | 'revise' | 'remove';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECIMAL = /^-?\d+(?:\.\d+)?$/;
const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;
const LIMIT = 99_999_999.99;
const allowed = {
  confirm: ['commandId', 'productionDate', 'openingCarryHours', 'calculatedOpeningCarrySnapshot', 'calculationVersion', 'note'],
  revise: ['commandId', 'productionDate', 'openingCarryHours', 'calculatedOpeningCarrySnapshot', 'calculationVersion', 'note', 'expectedCheckpointId', 'expectedRevisionNumber'],
  remove: ['commandId', 'productionDate', 'expectedCheckpointId', 'expectedRevisionNumber', 'removalReason'],
} satisfies Record<Operation, string[]>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE.exec(value); if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}
function validHours(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > LIMIT) return false;
  const scaled = value * 100;
  return Math.abs(scaled - Math.round(scaled)) <= Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
}
function optionalText(value: unknown, field: string, errors: Record<string, string>) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') { errors[field] = 'Must be text.'; return null; }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) errors[field] = 'Must be 500 characters or fewer.';
  return trimmed;
}
export function validateCheckpointRequest(operation: Operation, input: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; fieldErrors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (!record(input)) return { ok: false, fieldErrors: { _form: 'A request object is required.' } };
  for (const key of Object.keys(input)) if (!allowed[operation].includes(key)) errors[key] = 'Unexpected field.';
  if (typeof input.commandId !== 'string' || !UUID.test(input.commandId)) errors.commandId = 'A valid command UUID is required.';
  if (!validDate(input.productionDate)) errors.productionDate = 'Use a real date in YYYY-MM-DD format.';
  if (operation !== 'remove' && !validHours(input.openingCarryHours)) errors.openingCarryHours = 'Use 0 to 99999999.99 with at most two decimals.';
  if (operation !== 'remove' && input.calculatedOpeningCarrySnapshot !== undefined && input.calculatedOpeningCarrySnapshot !== null && !validHours(input.calculatedOpeningCarrySnapshot)) errors.calculatedOpeningCarrySnapshot = 'Use 0 to 99999999.99 with at most two decimals.';
  const normalized: Record<string, unknown> = { ...input };
  if (operation !== 'remove') {
    normalized.calculatedOpeningCarrySnapshot = input.calculatedOpeningCarrySnapshot ?? null;
    normalized.calculationVersion = optionalText(input.calculationVersion, 'calculationVersion', errors);
    normalized.note = optionalText(input.note, 'note', errors);
  }
  if (operation !== 'confirm') {
    if (typeof input.expectedCheckpointId !== 'string' || !UUID.test(input.expectedCheckpointId)) errors.expectedCheckpointId = 'A valid checkpoint UUID is required.';
    if (!Number.isInteger(input.expectedRevisionNumber) || Number(input.expectedRevisionNumber) <= 0) errors.expectedRevisionNumber = 'A positive revision number is required.';
  }
  if (operation === 'remove') {
    normalized.removalReason = optionalText(input.removalReason, 'removalReason', errors);
    if (normalized.removalReason === null) errors.removalReason = 'A removal reason is required.';
  }
  return Object.keys(errors).length ? { ok: false, fieldErrors: errors } : { ok: true, value: normalized };
}

const errorMessages: Record<Exclude<CheckpointErrorCode, 'validation_error' | 'malformed_response' | 'unavailable'>, string> = {
  authentication_required: 'Sign in to manage production checkpoints.', active_profile_required: 'An active DoorGo profile is required.',
  permission_required: 'You do not have permission to manage production checkpoints.', invalid_request: 'The checkpoint request is invalid.',
  future_date_not_allowed: 'A checkpoint cannot be recorded for a future date.', invalid_carry_value: 'The carry value is invalid.',
  too_many_decimal_places: 'Carry hours may have at most two decimal places.', note_required: 'A removal reason is required.', note_too_long: 'The note is too long.',
  command_uuid_collision: 'This command ID was already used for different data.', already_confirmed: 'A checkpoint is already confirmed for this date.',
  not_found: 'The checkpoint was not found.', stale_revision: 'The checkpoint changed. Refresh and try again.', inconsistent_history: 'The checkpoint history is inconsistent and cannot be changed.',
};
export function mapCheckpointError(error: unknown): CheckpointActionResult {
  const message = record(error) && typeof error.message === 'string' ? error.message.trim() : '';
  for (const code of Object.keys(errorMessages) as (keyof typeof errorMessages)[]) {
    if (message === `checkpoint.${code}`) return { ok: false, code, message: errorMessages[code] };
  }
  return { ok: false, code: 'unavailable', message: 'The checkpoint could not be saved. Please try again.' };
}
function numeric(value: unknown, nullable = false): number | null | undefined {
  if (value === null && nullable) return null;
  if (typeof value === 'string' && !DECIMAL.test(value)) return undefined;
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const result = Number(value); return Number.isFinite(result) ? result : undefined;
}
function nullableString(value: unknown): string | null | undefined { return value === null ? null : typeof value === 'string' ? value : undefined; }
function timestamp(value: unknown, nullable = false): string | null | undefined {
  if (value === null && nullable) return null;
  if (typeof value !== 'string') return undefined;
  const match = TIMESTAMP.exec(value);
  if (!match || !validDate(match[1])) return undefined;
  const hour = Number(match[2]); const minute = Number(match[3]); const second = Number(match[4]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]); const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  return hour <= 23 && minute <= 59 && second <= 59 && offsetHour <= 23 && offsetMinute <= 59 ? value : undefined;
}
export function normalizeCheckpointResponse(raw: unknown): NormalizedProductionFlowCheckpoint | null {
  const row = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
  if (!record(row)) return null;
  const opening = numeric(row.opening_carry_hours); const calculated = numeric(row.calculated_opening_carry_snapshot, true); const adjustment = numeric(row.adjustment_hours_snapshot, true);
  const supersedes = nullableString(row.supersedes_checkpoint_id); const supersededBy = nullableString(row.superseded_by_checkpoint_id);
  const version = nullableString(row.calculation_version); const note = nullableString(row.note); const recordedAt = timestamp(row.recorded_at); const confirmedAt = timestamp(row.confirmed_at, true);
  if (typeof row.checkpoint_id !== 'string' || !UUID.test(row.checkpoint_id) || typeof row.checkpoint_series_id !== 'string' || !UUID.test(row.checkpoint_series_id)
    || !validDate(row.production_date) || !Number.isInteger(row.revision_number) || Number(row.revision_number) <= 0
    || !['confirmed', 'superseded', 'voided'].includes(String(row.checkpoint_status)) || opening === undefined || opening === null || calculated === undefined || adjustment === undefined
    || supersedes === undefined || supersededBy === undefined || (supersedes !== null && !UUID.test(supersedes)) || (supersededBy !== null && !UUID.test(supersededBy))
    || version === undefined || note === undefined || recordedAt === undefined || recordedAt === null || confirmedAt === undefined) return null;
  return { checkpointId: row.checkpoint_id, checkpointSeriesId: row.checkpoint_series_id, productionDate: row.production_date, revisionNumber: row.revision_number as number,
    status: row.checkpoint_status as CheckpointStatus, supersedesCheckpointId: supersedes, supersededByCheckpointId: supersededBy,
    openingCarryHours: opening, calculatedOpeningCarrySnapshot: calculated, adjustmentHoursSnapshot: adjustment, calculationVersion: version, note, recordedAt, confirmedAt };
}

export type CheckpointRpc = (name: string, parameters: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
export async function executeCheckpointOperation(operation: Operation, input: unknown, dependencies: { getUser: () => Promise<{ user: unknown; error: unknown }>; rpc: CheckpointRpc }): Promise<CheckpointActionResult> {
  const validation = validateCheckpointRequest(operation, input);
  if (validation.ok === false) return { ok: false, code: 'validation_error', message: 'Check the highlighted fields.', fieldErrors: validation.fieldErrors };
  const value = validation.value;
  const auth = await dependencies.getUser();
  if (auth.error) return { ok: false, code: 'unavailable', message: 'The checkpoint could not be saved. Please try again.' };
  if (!auth.user) return { ok: false, code: 'authentication_required', message: errorMessages.authentication_required };
  const parameters = operation === 'confirm' ? { p_checkpoint_id: value.commandId, p_production_date: value.productionDate, p_opening_carry_hours: value.openingCarryHours, p_calculated_opening_carry_snapshot: value.calculatedOpeningCarrySnapshot, p_calculation_version: value.calculationVersion, p_note: value.note }
    : operation === 'revise' ? { p_new_checkpoint_id: value.commandId, p_production_date: value.productionDate, p_expected_checkpoint_id: value.expectedCheckpointId, p_expected_revision_number: value.expectedRevisionNumber, p_opening_carry_hours: value.openingCarryHours, p_calculated_opening_carry_snapshot: value.calculatedOpeningCarrySnapshot, p_calculation_version: value.calculationVersion, p_note: value.note }
      : { p_void_checkpoint_id: value.commandId, p_production_date: value.productionDate, p_expected_checkpoint_id: value.expectedCheckpointId, p_expected_revision_number: value.expectedRevisionNumber, p_note: value.removalReason };
  const result = await dependencies.rpc(CHECKPOINT_RPC_NAMES[operation], parameters);
  if (result.error) return mapCheckpointError(result.error);
  const checkpoint = normalizeCheckpointResponse(result.data);
  const expectedRevision = Number(value.expectedRevisionNumber) + 1;
  const valid = checkpoint && checkpoint.checkpointId === value.commandId && checkpoint.productionDate === value.productionDate
    && (operation === 'confirm' ? checkpoint.status === 'confirmed' && (checkpoint.revisionNumber === 1 ? checkpoint.supersedesCheckpointId === null : checkpoint.supersedesCheckpointId !== null) : checkpoint.supersedesCheckpointId === value.expectedCheckpointId && checkpoint.revisionNumber === expectedRevision
      && (operation === 'revise' ? checkpoint.status === 'confirmed' : checkpoint.status === 'voided' && checkpoint.confirmedAt === null));
  return valid ? { ok: true, checkpoint } : { ok: false, code: 'malformed_response', message: 'The checkpoint response could not be verified.' };
}

export type CheckpointClient = { getUser: () => Promise<{ user: unknown; error: unknown }>; rpc: CheckpointRpc };
export function createCheckpointService(createClient: () => Promise<CheckpointClient>) {
  return async (operation: Operation, request: unknown): Promise<CheckpointActionResult> => {
    try {
      return await executeCheckpointOperation(operation, request, await createClient());
    } catch {
      return { ok: false, code: 'unavailable', message: 'The checkpoint could not be saved. Please try again.' };
    }
  };
}
