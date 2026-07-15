export const PRODUCTION_RECOVERY_READ_RPC =
  'read_recent_production_recovery_bookings';
export const PRODUCTION_BOOKING_MOVE_RPC =
  'move_production_booking_to_today';
export const PRODUCTION_RECOVERY_REVALIDATE_PATHS = [
  '/production-board',
  '/production-checkpoints',
  '/production-recovery',
] as const;
export const PRODUCTION_RECOVERY_CARRY_WARNING =
  "Do not include this moved job's hours in Actual carry.";

export type ProductionAccessLevel = 'none' | 'view' | 'use';
export const canReadProductionRecovery = (access: ProductionAccessLevel) =>
  access === 'view' || access === 'use';
export const canMoveProductionRecovery = (access: ProductionAccessLevel) =>
  access === 'use';

export type ProductionRecoveryBooking = {
  bookingId: string;
  productionDate: string;
  shopHours: number;
  displayTitle: string;
  jobId: string | null;
  salesOrder: string | null;
  bookingKind: 'production';
  scheduleStatus: 'confirmed';
  bookingOrigin: string | null;
  explicitlyCompleted: false;
  locked: false;
  legacyCalendarLinked: boolean;
};

export type MoveProductionBookingRequest = {
  commandId: string;
  bookingId: string;
  expectedProductionDate: string;
  whollyUnstartedAcknowledged: boolean;
};

export type ProductionBookingMove = {
  moveId: string;
  bookingId: string;
  previousProductionDate: string;
  newProductionDate: string;
  shopHours: number;
  movedAt: string;
  status: 'moved';
};

export type ProductionBookingMoveErrorCode =
  | 'validation_error'
  | 'authentication_required'
  | 'active_profile_required'
  | 'permission_required'
  | 'invalid_request'
  | 'invalid_booking_id'
  | 'acknowledgement_required'
  | 'not_past_date'
  | 'closed_date_override_required'
  | 'command_uuid_collision'
  | 'not_found'
  | 'stale_booking'
  | 'already_moved'
  | 'ineligible_booking'
  | 'malformed_response'
  | 'unavailable';

export type ProductionBookingMoveResult =
  | { ok: true; move: ProductionBookingMove }
  | {
      ok: false;
      code: ProductionBookingMoveErrorCode;
      message: string;
      fieldErrors?: Record<string, string>;
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECIMAL = /^\d+(?:\.\d+)?$/;
const TIMESTAMP =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;
const MAX_HOURS = 99_999_999.99;
const REQUEST_KEYS = [
  'commandId',
  'bookingId',
  'expectedProductionDate',
  'whollyUnstartedAcknowledged',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export function getVancouverDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function numeric(value: unknown): number | null {
  if (typeof value === 'string' && !DECIMAL.test(value)) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > MAX_HOURS) return null;
  const scaled = result * 100;
  return Math.abs(scaled - Math.round(scaled)) <=
    Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4
    ? result
    : null;
}

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === 'string' ? value : undefined;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = TIMESTAMP.exec(value);
  if (!match || !isValidDateOnly(match[1])) return null;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  return hour <= 23 && minute <= 59 && second <= 59 &&
    offsetHour <= 23 && offsetMinute <= 59
    ? value
    : null;
}

export function validateMoveProductionBookingRequest(
  input: unknown,
  today = getVancouverDate(),
):
  | { ok: true; value: MoveProductionBookingRequest }
  | { ok: false; fieldErrors: Record<string, string> } {
  if (!isRecord(input)) {
    return { ok: false, fieldErrors: { _form: 'A request object is required.' } };
  }

  const errors: Record<string, string> = {};
  for (const key of Object.keys(input)) {
    if (!REQUEST_KEYS.includes(key)) errors[key] = 'Unexpected field.';
  }
  if (typeof input.commandId !== 'string' || !UUID.test(input.commandId)) {
    errors.commandId = 'A valid command UUID is required.';
  }
  if (
    typeof input.bookingId !== 'string' ||
    !input.bookingId.trim() ||
    input.bookingId !== input.bookingId.trim() ||
    input.bookingId.length > 500
  ) {
    errors.bookingId = 'A valid booking ID is required.';
  }
  if (!isValidDateOnly(input.expectedProductionDate)) {
    errors.expectedProductionDate = 'Use a real date in YYYY-MM-DD format.';
  } else if (input.expectedProductionDate >= today) {
    errors.expectedProductionDate = 'The expected production date must be before today.';
  }
  if (input.whollyUnstartedAcknowledged !== true) {
    errors.whollyUnstartedAcknowledged = 'Confirm that the whole job was not started.';
  }

  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };
  return { ok: true, value: input as MoveProductionBookingRequest };
}

export function normalizeRecoveryBookingRows(
  raw: unknown,
): ProductionRecoveryBooking[] | null {
  if (!Array.isArray(raw)) return null;
  const result: ProductionRecoveryBooking[] = [];
  for (const value of raw) {
    if (!isRecord(value)) return null;
    const hours = numeric(value.shop_hours);
    const jobId = nullableString(value.job_id);
    const salesOrder = nullableString(value.sales_order);
    const origin = nullableString(value.booking_origin);
    if (
      typeof value.booking_id !== 'string' || !value.booking_id.trim() ||
      !isValidDateOnly(value.production_date) || hours === null ||
      typeof value.display_title !== 'string' || !value.display_title.trim() ||
      jobId === undefined || salesOrder === undefined || origin === undefined ||
      value.booking_kind !== 'production' ||
      value.schedule_status !== 'confirmed' ||
      value.explicitly_completed !== false || value.locked !== false ||
      typeof value.legacy_calendar_linked !== 'boolean'
    ) return null;
    result.push({
      bookingId: value.booking_id,
      productionDate: value.production_date,
      shopHours: hours,
      displayTitle: value.display_title,
      jobId,
      salesOrder,
      bookingKind: 'production',
      scheduleStatus: 'confirmed',
      bookingOrigin: origin,
      explicitlyCompleted: false,
      locked: false,
      legacyCalendarLinked: value.legacy_calendar_linked,
    });
  }
  return result;
}

export function normalizeProductionBookingMoveResponse(
  raw: unknown,
): ProductionBookingMove | null {
  const row = Array.isArray(raw) && raw.length === 1 ? raw[0] : raw;
  if (!isRecord(row)) return null;
  const hours = numeric(row.shop_hours);
  const movedAt = timestamp(row.moved_at);
  if (
    typeof row.move_id !== 'string' || !UUID.test(row.move_id) ||
    typeof row.booking_id !== 'string' || !row.booking_id.trim() ||
    !isValidDateOnly(row.previous_production_date) ||
    !isValidDateOnly(row.new_production_date) ||
    row.new_production_date <= row.previous_production_date ||
    hours === null || movedAt === null || row.status !== 'moved'
  ) return null;
  return {
    moveId: row.move_id,
    bookingId: row.booking_id,
    previousProductionDate: row.previous_production_date,
    newProductionDate: row.new_production_date,
    shopHours: hours,
    movedAt,
    status: 'moved',
  };
}

const errorMessages: Record<
  Exclude<ProductionBookingMoveErrorCode, 'validation_error' | 'malformed_response' | 'unavailable'>,
  string
> = {
  authentication_required: 'Sign in to move production bookings.',
  active_profile_required: 'An active DoorGo profile is required.',
  permission_required: 'You do not have permission to move production bookings.',
  invalid_request: 'The production booking move request is invalid.',
  invalid_booking_id: 'The production booking ID is invalid.',
  acknowledgement_required: 'Confirm that the whole job was not started.',
  not_past_date: 'Only a past production booking can be moved to today.',
  closed_date_override_required: 'This production date is marked closed. Use Production Schedule to confirm the closed-date override.',
  command_uuid_collision: 'This command ID was already used for a different move.',
  not_found: 'The production booking was not found.',
  stale_booking: 'The production booking changed. Refresh and try again.',
  already_moved: 'The production booking has already been moved to today.',
  ineligible_booking: 'The production booking is no longer eligible to move.',
};

export function productionBookingMoveFailure(
  code: keyof typeof errorMessages,
): ProductionBookingMoveResult {
  return { ok: false, code, message: errorMessages[code] };
}

export function mapProductionBookingMoveError(error: unknown): ProductionBookingMoveResult {
  const message = isRecord(error) && typeof error.message === 'string'
    ? error.message.trim()
    : '';
  for (const code of Object.keys(errorMessages) as (keyof typeof errorMessages)[]) {
    if (message === `production_booking_move.${code}`) {
      return productionBookingMoveFailure(code);
    }
  }
  return {
    ok: false,
    code: 'unavailable',
    message: 'The production booking could not be moved. Please try again.',
  };
}

export type ProductionBookingMoveRpc = (
  name: string,
  parameters: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

export async function executeProductionBookingMove(
  input: unknown,
  dependencies: { rpc: ProductionBookingMoveRpc; today?: string },
): Promise<ProductionBookingMoveResult> {
  const today = dependencies.today ?? getVancouverDate();
  const validation = validateMoveProductionBookingRequest(input, today);
  if (validation.ok === false) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'Check the highlighted fields.',
      fieldErrors: validation.fieldErrors,
    };
  }
  const value = validation.value;
  const result = await dependencies.rpc(PRODUCTION_BOOKING_MOVE_RPC, {
    p_command_id: value.commandId,
    p_booking_id: value.bookingId,
    p_expected_production_date: value.expectedProductionDate,
    p_wholly_unstarted_acknowledged: value.whollyUnstartedAcknowledged,
  });
  if (result.error) return mapProductionBookingMoveError(result.error);
  const move = normalizeProductionBookingMoveResponse(result.data);
  if (
    !move || move.bookingId !== value.bookingId ||
    move.previousProductionDate !== value.expectedProductionDate ||
    move.newProductionDate !== today
  ) {
    return {
      ok: false,
      code: 'malformed_response',
      message: 'The production booking move response could not be verified.',
    };
  }
  return { ok: true, move };
}

export function createProductionBookingMoveExecutor(
  createRpc: () => Promise<ProductionBookingMoveRpc>,
) {
  return async (request: unknown): Promise<ProductionBookingMoveResult> => {
    try {
      return await executeProductionBookingMove(request, { rpc: await createRpc() });
    } catch {
      return {
        ok: false,
        code: 'unavailable',
        message: 'The production booking could not be moved. Please try again.',
      };
    }
  };
}
