import {
  getPermissionAccess,
  type CurrentDoorGoAccess,
} from '../auth/access';

export const PRODUCTION_BOOKING_RESCHEDULE_RPC = 'reschedule_production_booking';
export const PRODUCTION_RESCHEDULE_REVALIDATE_PATHS = [
  '/production-board',
  '/production-schedule',
  '/production-recovery',
  '/production-checkpoints',
] as const;

export type RescheduleProductionBookingRequest = {
  commandId: string;
  bookingId: string;
  expectedProductionDate: string;
  destinationProductionDate: string;
  whollyUnstartedAcknowledged: boolean;
  backdateReason: string | null;
  closedDateOverrideAcknowledged: boolean;
};

export type ProductionBookingReschedule = {
  moveId: string;
  bookingId: string;
  previousProductionDate: string;
  newProductionDate: string;
  shopHours: number;
  movedAt: string;
  actionType: 'reschedule' | 'backdate';
  destinationWasClosed: boolean;
  status: 'moved';
};

export type ProductionBookingRescheduleErrorCode =
  | 'authentication_required' | 'active_profile_required' | 'permission_required'
  | 'invalid_request' | 'invalid_booking_id' | 'no_change' | 'stale_booking'
  | 'acknowledgement_required' | 'backdate_reason_required'
  | 'invalid_backdate_reason' | 'closed_date_override_required'
  | 'command_uuid_collision' | 'not_found' | 'ineligible_booking'
  | 'malformed_response' | 'unavailable';

export type ProductionBookingRescheduleResult =
  | { ok: true; move: ProductionBookingReschedule }
  | { ok: false; code: ProductionBookingRescheduleErrorCode; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const ALLOWED_KEYS = new Set([
  'commandId', 'bookingId', 'expectedProductionDate', 'destinationProductionDate',
  'whollyUnstartedAcknowledged', 'backdateReason', 'closedDateOverrideAcknowledged',
]);

export function canRescheduleProductionBooking(access: CurrentDoorGoAccess): boolean {
  return getPermissionAccess(access, 'production') === 'use';
}

export function isValidRescheduleDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateProductionBookingRescheduleRequest(
  input: unknown,
  today: string,
): { ok: true; value: RescheduleProductionBookingRequest } | { ok: false; code: ProductionBookingRescheduleErrorCode } {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !isValidRescheduleDate(today)) {
    return { ok: false, code: 'invalid_request' };
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_KEYS.has(key))
    || typeof record.commandId !== 'string' || !UUID.test(record.commandId)
    || typeof record.bookingId !== 'string'
    || typeof record.whollyUnstartedAcknowledged !== 'boolean'
    || typeof record.closedDateOverrideAcknowledged !== 'boolean'
    || !isValidRescheduleDate(record.expectedProductionDate)
    || !isValidRescheduleDate(record.destinationProductionDate)
    || (record.backdateReason !== null && typeof record.backdateReason !== 'string')) {
    return { ok: false, code: 'invalid_request' };
  }
  if (!record.bookingId || record.bookingId.length > 500 || record.bookingId !== record.bookingId.trim()) {
    return { ok: false, code: 'invalid_booking_id' };
  }
  if (record.expectedProductionDate === record.destinationProductionDate) {
    return { ok: false, code: 'no_change' };
  }
  const reason = typeof record.backdateReason === 'string' ? record.backdateReason.trim() : '';
  if (reason.length > 500) return { ok: false, code: 'invalid_backdate_reason' };
  return {
    ok: true,
    value: {
      commandId: record.commandId,
      bookingId: record.bookingId,
      expectedProductionDate: record.expectedProductionDate,
      destinationProductionDate: record.destinationProductionDate,
      whollyUnstartedAcknowledged: record.whollyUnstartedAcknowledged,
      backdateReason: reason || null,
      closedDateOverrideAcknowledged: record.closedDateOverrideAcknowledged,
    },
  };
}

const messages: Record<ProductionBookingRescheduleErrorCode, string> = {
  authentication_required: 'Sign in before rescheduling production.',
  active_profile_required: 'An active DoorGo profile is required.',
  permission_required: 'Production use permission is required.',
  invalid_request: 'The reschedule request is invalid.',
  invalid_booking_id: 'The production booking identifier is invalid.',
  no_change: 'Choose a different production date.',
  stale_booking: 'This booking moved after the schedule was loaded. Refresh and try again.',
  acknowledgement_required: 'Confirm that the whole job was not started.',
  backdate_reason_required: 'A reason is required when moving production into the past.',
  invalid_backdate_reason: 'The backdate reason is invalid.',
  closed_date_override_required: 'Confirm the closed production date override.',
  command_uuid_collision: 'This reschedule command conflicts with an earlier request.',
  not_found: 'The production booking was not found.',
  ineligible_booking: 'This production booking cannot be rescheduled.',
  malformed_response: 'The production reschedule response was invalid.',
  unavailable: 'The production booking could not be rescheduled. Please try again.',
};

export function productionBookingRescheduleFailure(code: ProductionBookingRescheduleErrorCode): ProductionBookingRescheduleResult {
  return { ok: false, code, message: messages[code] };
}

const DATABASE_CODES = new Set<ProductionBookingRescheduleErrorCode>([
  'authentication_required', 'active_profile_required', 'permission_required', 'invalid_request',
  'invalid_booking_id', 'no_change', 'stale_booking', 'acknowledgement_required',
  'backdate_reason_required', 'invalid_backdate_reason', 'closed_date_override_required',
  'command_uuid_collision', 'not_found', 'ineligible_booking',
]);

export function mapProductionBookingRescheduleError(error: unknown): ProductionBookingRescheduleResult {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message.trim() : '';
  const prefix = 'production_booking_reschedule.';
  const code = message.startsWith(prefix) ? message.slice(prefix.length) as ProductionBookingRescheduleErrorCode : null;
  return productionBookingRescheduleFailure(code && DATABASE_CODES.has(code) ? code : 'unavailable');
}

function decimal(value: unknown): number | null {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') return null;
  const text = String(value);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeProductionBookingRescheduleResponse(value: unknown): ProductionBookingReschedule | null {
  const row = Array.isArray(value) && value.length === 1 ? value[0] : null;
  if (!row || typeof row !== 'object') return null;
  const item = row as Record<string, unknown>;
  const shopHours = decimal(item.shop_hours);
  if (typeof item.move_id !== 'string' || !UUID.test(item.move_id)
    || typeof item.booking_id !== 'string' || !item.booking_id
    || !isValidRescheduleDate(item.previous_production_date)
    || !isValidRescheduleDate(item.new_production_date)
    || shopHours === null || shopHours < 0
    || typeof item.moved_at !== 'string' || !TIMESTAMP_WITH_ZONE.test(item.moved_at)
    || Number.isNaN(Date.parse(item.moved_at))
    || (item.action_type !== 'reschedule' && item.action_type !== 'backdate')
    || typeof item.destination_was_closed !== 'boolean'
    || item.status !== 'moved') return null;
  return {
    moveId: item.move_id, bookingId: item.booking_id,
    previousProductionDate: item.previous_production_date,
    newProductionDate: item.new_production_date, shopHours,
    movedAt: item.moved_at, actionType: item.action_type,
    destinationWasClosed: item.destination_was_closed, status: 'moved',
  };
}

export type ProductionBookingRescheduleRpc = (
  name: typeof PRODUCTION_BOOKING_RESCHEDULE_RPC,
  parameters: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

export async function executeProductionBookingReschedule(
  input: unknown,
  dependencies: { rpc: ProductionBookingRescheduleRpc; today: string },
): Promise<ProductionBookingRescheduleResult> {
  const validation = validateProductionBookingRescheduleRequest(input, dependencies.today);
  if (validation.ok === false) return productionBookingRescheduleFailure(validation.code);
  const request = validation.value;
  const result = await dependencies.rpc(PRODUCTION_BOOKING_RESCHEDULE_RPC, {
    p_command_id: request.commandId,
    p_booking_id: request.bookingId,
    p_expected_production_date: request.expectedProductionDate,
    p_destination_production_date: request.destinationProductionDate,
    p_wholly_unstarted_acknowledged: request.whollyUnstartedAcknowledged,
    p_backdate_reason: request.backdateReason,
    p_closed_date_override_acknowledged: request.closedDateOverrideAcknowledged,
  });
  if (result.error) return mapProductionBookingRescheduleError(result.error);
  const move = normalizeProductionBookingRescheduleResponse(result.data);
  return move ? { ok: true, move } : productionBookingRescheduleFailure('malformed_response');
}

export function createProductionBookingRescheduleExecutor(
  createRpc: () => Promise<ProductionBookingRescheduleRpc>,
  getToday: () => string,
) {
  return async (request: unknown): Promise<ProductionBookingRescheduleResult> => {
    try {
      return await executeProductionBookingReschedule(request, { rpc: await createRpc(), today: getToday() });
    } catch {
      return productionBookingRescheduleFailure('unavailable');
    }
  };
}
