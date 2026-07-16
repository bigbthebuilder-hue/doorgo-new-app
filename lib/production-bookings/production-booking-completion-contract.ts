import {
  getPermissionAccess,
  type CurrentDoorGoAccess,
} from '../auth/access';

export const COMPLETE_PRODUCTION_BOOKING_RPC = 'complete_production_booking';
export const REOPEN_PRODUCTION_BOOKING_RPC = 'reopen_production_booking';
export const PRODUCTION_COMPLETION_REVALIDATE_PATHS = [
  '/production-board',
  '/production-schedule',
  '/production-recovery',
  '/production-checkpoints',
] as const;

export type CompleteProductionBookingRequest = {
  commandId: string;
  bookingId: string;
  expectedProductionDate: string;
};

export type ReopenProductionBookingRequest = {
  commandId: string;
  bookingId: string;
  expectedProductionDate: string;
  expectedCompletedAt: string;
  reason: string;
};

export type ProductionBookingCompletionEvent = {
  eventId: string;
  bookingId: string;
  productionDate: string;
  previousCompletedAt: string | null;
  resultingCompletedAt: string | null;
  occurredAt: string;
  actionType: 'completed' | 'reopened';
  status: 'completed' | 'reopened';
};

export type ProductionBookingCompletionErrorCode =
  | 'authentication_required'
  | 'active_profile_required'
  | 'permission_required'
  | 'invalid_request'
  | 'invalid_booking_id'
  | 'command_uuid_collision'
  | 'not_found'
  | 'ineligible_booking'
  | 'stale_booking'
  | 'already_completed'
  | 'not_completed'
  | 'reason_required'
  | 'invalid_reason'
  | 'malformed_response'
  | 'unavailable';

export type ProductionBookingCompletionResult =
  | { ok: true; event: ProductionBookingCompletionEvent }
  | { ok: false; code: ProductionBookingCompletionErrorCode; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_WITH_ZONE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;
const COMPLETE_KEYS = new Set(['commandId', 'bookingId', 'expectedProductionDate']);
const REOPEN_KEYS = new Set([
  'commandId',
  'bookingId',
  'expectedProductionDate',
  'expectedCompletedAt',
  'reason',
]);

export function isValidProductionCompletionDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function isValidProductionCompletionTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = TIMESTAMP_WITH_ZONE.exec(value);
  if (!match || !isValidProductionCompletionDate(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offsetHour = match[5] === undefined ? 0 : Number(match[5]);
  const offsetMinute = match[6] === undefined ? 0 : Number(match[6]);
  return hour <= 23
    && minute <= 59
    && second <= 59
    && offsetHour <= 23
    && offsetMinute <= 59
    && !Number.isNaN(Date.parse(value));
}

function validateIdentity(
  record: Record<string, unknown>,
  allowedKeys: Set<string>,
): ProductionBookingCompletionErrorCode | null {
  if (Object.keys(record).some((key) => !allowedKeys.has(key))
    || typeof record.commandId !== 'string'
    || !UUID.test(record.commandId)
    || !isValidProductionCompletionDate(record.expectedProductionDate)) {
    return 'invalid_request';
  }
  if (typeof record.bookingId !== 'string'
    || record.bookingId.length < 1
    || record.bookingId.length > 500
    || record.bookingId !== record.bookingId.trim()) {
    return 'invalid_booking_id';
  }
  return null;
}

export function validateCompleteProductionBookingRequest(
  input: unknown,
): { ok: true; value: CompleteProductionBookingRequest } | { ok: false; code: ProductionBookingCompletionErrorCode } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, code: 'invalid_request' };
  }
  const record = input as Record<string, unknown>;
  const error = validateIdentity(record, COMPLETE_KEYS);
  if (error) return { ok: false, code: error };
  return {
    ok: true,
    value: {
      commandId: record.commandId as string,
      bookingId: record.bookingId as string,
      expectedProductionDate: record.expectedProductionDate as string,
    },
  };
}

export function validateReopenProductionBookingRequest(
  input: unknown,
): { ok: true; value: ReopenProductionBookingRequest } | { ok: false; code: ProductionBookingCompletionErrorCode } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, code: 'invalid_request' };
  }
  const record = input as Record<string, unknown>;
  const error = validateIdentity(record, REOPEN_KEYS);
  if (error) return { ok: false, code: error };
  if (!isValidProductionCompletionTimestamp(record.expectedCompletedAt)
    || typeof record.reason !== 'string') {
    return { ok: false, code: 'invalid_request' };
  }
  const reason = record.reason.trim();
  if (!reason) return { ok: false, code: 'reason_required' };
  if (reason.length > 500) return { ok: false, code: 'invalid_reason' };
  return {
    ok: true,
    value: {
      commandId: record.commandId as string,
      bookingId: record.bookingId as string,
      expectedProductionDate: record.expectedProductionDate as string,
      expectedCompletedAt: record.expectedCompletedAt,
      reason,
    },
  };
}

export function getProductionCompletionAuthorizationError(
  access: CurrentDoorGoAccess,
): Extract<ProductionBookingCompletionErrorCode, 'authentication_required' | 'active_profile_required' | 'permission_required'> | null {
  if (access.state === 'unauthenticated') return 'authentication_required';
  if (access.state !== 'active') return 'active_profile_required';
  return getPermissionAccess(access, 'production') === 'use' ? null : 'permission_required';
}

const messages: Record<ProductionBookingCompletionErrorCode, string> = {
  authentication_required: 'Sign in before changing production completion.',
  active_profile_required: 'An active DoorGo profile is required.',
  permission_required: 'Production use permission is required.',
  invalid_request: 'The production completion request is invalid.',
  invalid_booking_id: 'The production booking identifier is invalid.',
  command_uuid_collision: 'This completion command conflicts with an earlier request.',
  not_found: 'The production booking was not found.',
  ineligible_booking: 'This production booking cannot be changed.',
  stale_booking: 'This booking changed after the page was loaded. Refresh and try again.',
  already_completed: 'This production booking is already completed.',
  not_completed: 'This production booking is not completed.',
  reason_required: 'A reason is required to reopen production.',
  invalid_reason: 'The reopen reason is invalid.',
  malformed_response: 'The production completion response was invalid.',
  unavailable: 'Production completion could not be changed. Please try again.',
};

export function productionBookingCompletionFailure(
  code: ProductionBookingCompletionErrorCode,
): ProductionBookingCompletionResult {
  return { ok: false, code, message: messages[code] };
}

const DATABASE_CODES = new Set<ProductionBookingCompletionErrorCode>([
  'authentication_required',
  'active_profile_required',
  'permission_required',
  'invalid_request',
  'invalid_booking_id',
  'command_uuid_collision',
  'not_found',
  'ineligible_booking',
  'stale_booking',
  'already_completed',
  'not_completed',
  'reason_required',
  'invalid_reason',
]);

export function mapProductionBookingCompletionError(error: unknown): ProductionBookingCompletionResult {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message.trim()
    : '';
  const prefix = 'production_booking_completion.';
  if (!message.startsWith(prefix)) return productionBookingCompletionFailure('unavailable');
  const code = message.slice(prefix.length) as ProductionBookingCompletionErrorCode;
  return productionBookingCompletionFailure(DATABASE_CODES.has(code) ? code : 'unavailable');
}

export function normalizeProductionBookingCompletionResponse(
  value: unknown,
): ProductionBookingCompletionEvent | null {
  const row = Array.isArray(value) && value.length === 1 ? value[0] : null;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const item = row as Record<string, unknown>;
  if (typeof item.event_id !== 'string'
    || !UUID.test(item.event_id)
    || typeof item.booking_id !== 'string'
    || item.booking_id.length < 1
    || item.booking_id.length > 500
    || item.booking_id !== item.booking_id.trim()
    || !isValidProductionCompletionDate(item.production_date)
    || !isValidProductionCompletionTimestamp(item.occurred_at)
    || (item.previous_completed_at !== null
      && !isValidProductionCompletionTimestamp(item.previous_completed_at))
    || (item.resulting_completed_at !== null
      && !isValidProductionCompletionTimestamp(item.resulting_completed_at))
    || (item.action_type !== 'completed' && item.action_type !== 'reopened')
    || item.status !== item.action_type) {
    return null;
  }
  if (item.action_type === 'completed'
    && (item.previous_completed_at !== null || item.resulting_completed_at === null)) {
    return null;
  }
  if (item.action_type === 'reopened'
    && (item.previous_completed_at === null || item.resulting_completed_at !== null)) {
    return null;
  }
  const previousCompletedAt = item.previous_completed_at as string | null;
  const resultingCompletedAt = item.resulting_completed_at as string | null;
  const actionType = item.action_type as 'completed' | 'reopened';
  return {
    eventId: item.event_id,
    bookingId: item.booking_id,
    productionDate: item.production_date,
    previousCompletedAt,
    resultingCompletedAt,
    occurredAt: item.occurred_at,
    actionType,
    status: actionType,
  };
}

export type ProductionBookingCompletionRpc = (
  name: typeof COMPLETE_PRODUCTION_BOOKING_RPC | typeof REOPEN_PRODUCTION_BOOKING_RPC,
  parameters: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

async function execute(
  rpc: ProductionBookingCompletionRpc,
  name: typeof COMPLETE_PRODUCTION_BOOKING_RPC | typeof REOPEN_PRODUCTION_BOOKING_RPC,
  parameters: Record<string, unknown>,
): Promise<ProductionBookingCompletionResult> {
  const result = await rpc(name, parameters);
  if (result.error) return mapProductionBookingCompletionError(result.error);
  const event = normalizeProductionBookingCompletionResponse(result.data);
  return event ? { ok: true, event } : productionBookingCompletionFailure('malformed_response');
}

export async function executeCompleteProductionBooking(
  input: unknown,
  rpc: ProductionBookingCompletionRpc,
): Promise<ProductionBookingCompletionResult> {
  const validation = validateCompleteProductionBookingRequest(input);
  if (validation.ok === false) return productionBookingCompletionFailure(validation.code);
  const request = validation.value;
  return execute(rpc, COMPLETE_PRODUCTION_BOOKING_RPC, {
    p_command_id: request.commandId,
    p_booking_id: request.bookingId,
    p_expected_production_date: request.expectedProductionDate,
  });
}

export async function executeReopenProductionBooking(
  input: unknown,
  rpc: ProductionBookingCompletionRpc,
): Promise<ProductionBookingCompletionResult> {
  const validation = validateReopenProductionBookingRequest(input);
  if (validation.ok === false) return productionBookingCompletionFailure(validation.code);
  const request = validation.value;
  return execute(rpc, REOPEN_PRODUCTION_BOOKING_RPC, {
    p_command_id: request.commandId,
    p_booking_id: request.bookingId,
    p_expected_production_date: request.expectedProductionDate,
    p_expected_completed_at: request.expectedCompletedAt,
    p_reason: request.reason,
  });
}

export function createProductionBookingCompletionExecutors(
  createRpc: () => Promise<ProductionBookingCompletionRpc>,
) {
  return {
    complete: async (request: unknown): Promise<ProductionBookingCompletionResult> => {
      try {
        return await executeCompleteProductionBooking(request, await createRpc());
      } catch {
        return productionBookingCompletionFailure('unavailable');
      }
    },
    reopen: async (request: unknown): Promise<ProductionBookingCompletionResult> => {
      try {
        return await executeReopenProductionBooking(request, await createRpc());
      } catch {
        return productionBookingCompletionFailure('unavailable');
      }
    },
  };
}
