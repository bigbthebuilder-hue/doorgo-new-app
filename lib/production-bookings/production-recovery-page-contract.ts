import {
  getVancouverDate,
  isValidDateOnly,
  type ProductionBookingMoveErrorCode,
} from './production-booking-move-contract';

export const PRODUCTION_RECOVERY_LIMIT = 100;
export const PRODUCTION_RECOVERY_MAX_RANGE_DAYS = 93;
export const WHOLE_JOB_ACKNOWLEDGEMENT = 'The whole job was not started.';
export const PARTLY_COMPLETED_GUIDANCE =
  'Partly completed jobs should stay on their original date. Enter only the remaining hours in Actual carry.';

export type RecoveryDateSelection =
  | {
      kind: 'default' | 'search';
      valid: true;
      startDate: string;
      endDate: string;
      businessDates: string[] | null;
      message: null;
    }
  | {
      kind: 'invalid';
      valid: false;
      startDate: null;
      endDate: null;
      businessDates: null;
      message: string;
    };

export type TodayProductionSummary = {
  productionDate: string;
  plannedHours: number | null;
  availableHours: number | null;
  remainingHours: number | null;
  overloadHours: number | null;
  capacityKnown: boolean;
  isClosed: boolean;
};

export type RecoveryMoveAttempt = {
  commandId: string | null;
  fingerprint: string | null;
};

export function productionRecoveryOriginLabel(
  bookingOrigin: string | null,
): 'DoorGo-linked' | 'BizTrack-only' | null {
  if (bookingOrigin === 'doorgo') return 'DoorGo-linked';
  if (bookingOrigin === 'biztrack') return 'BizTrack-only';
  return null;
}

export function productionRecoveryIdentifier(
  bookingOrigin: string | null,
  jobId: string | null,
  salesOrder: string | null,
): string | null {
  if (bookingOrigin === 'doorgo' && jobId) return `Job ${jobId}`;
  if (bookingOrigin === 'biztrack' && salesOrder) return `Sales order ${salesOrder}`;
  return null;
}

function addDays(dateText: string, days: number): string {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDifference(startDate: string, endDate: string): number {
  return Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000,
  );
}

function single(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

export function previousFiveBusinessDays(today = getVancouverDate()): {
  startDate: string;
  endDate: string;
  businessDates: string[];
} {
  if (!isValidDateOnly(today)) throw new Error('A valid current date is required.');
  const dates: string[] = [];
  for (let candidate = addDays(today, -1); dates.length < 5; candidate = addDays(candidate, -1)) {
    const weekday = new Date(`${candidate}T00:00:00Z`).getUTCDay();
    if (weekday >= 1 && weekday <= 5) dates.push(candidate);
  }
  dates.sort();
  return { startDate: dates[0], endDate: dates.at(-1)!, businessDates: dates };
}

export function selectRecoveryDateRange(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  today = getVancouverDate(),
): RecoveryDateSelection {
  const rawStart = searchParams?.start;
  const rawEnd = searchParams?.end;
  if (rawStart === undefined && rawEnd === undefined) {
    const defaults = previousFiveBusinessDays(today);
    return { kind: 'default', valid: true, ...defaults, message: null };
  }
  const startDate = single(rawStart);
  const endDate = single(rawEnd);
  if (!startDate || !endDate) {
    return { kind: 'invalid', valid: false, startDate: null, endDate: null, businessDates: null, message: 'Choose both a start date and an end date.' };
  }
  if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate)) {
    return { kind: 'invalid', valid: false, startDate: null, endDate: null, businessDates: null, message: 'Choose real dates in YYYY-MM-DD format.' };
  }
  if (startDate > endDate) {
    return { kind: 'invalid', valid: false, startDate: null, endDate: null, businessDates: null, message: 'The start date must not be after the end date.' };
  }
  if (endDate >= today) {
    return { kind: 'invalid', valid: false, startDate: null, endDate: null, businessDates: null, message: 'The end date must be before today in America/Vancouver.' };
  }
  if (dayDifference(startDate, endDate) > PRODUCTION_RECOVERY_MAX_RANGE_DAYS) {
    return { kind: 'invalid', valid: false, startDate: null, endDate: null, businessDates: null, message: 'Choose a date range of 93 days or fewer.' };
  }
  return { kind: 'search', valid: true, startDate, endDate, businessDates: null, message: null };
}

export function formatRecoveryDate(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export function commandForRecoveryMoveAttempt(
  state: RecoveryMoveAttempt,
  fingerprint: string,
  createUuid: () => string,
): RecoveryMoveAttempt {
  if (state.commandId && state.fingerprint === fingerprint) return state;
  return { commandId: createUuid(), fingerprint };
}

export function retainCommandForRetry(code: ProductionBookingMoveErrorCode): boolean {
  return code === 'unavailable' || code === 'malformed_response';
}

export function canSubmitRecoveryMove(acknowledged: boolean, pending: boolean): boolean {
  return acknowledged && !pending;
}

export function recoveryMoveMessage(code: ProductionBookingMoveErrorCode): string {
  switch (code) {
    case 'stale_booking': return 'This booking changed since the page was loaded. Refresh and review it again.';
    case 'already_moved': return 'This booking has already been moved to today.';
    case 'ineligible_booking': return 'This booking is no longer eligible to move.';
    case 'permission_required': return 'You no longer have permission to move production bookings.';
    case 'acknowledgement_required': return 'Confirm that the whole job was not started.';
    case 'command_uuid_collision': return 'This move request could not be safely retried. Refresh and try again.';
    case 'authentication_required':
    case 'active_profile_required': return 'Your session or account is not available. Sign in again.';
    case 'unavailable':
    case 'malformed_response': return 'The booking could not be moved right now. The booking may be checked again before retrying.';
    default: return 'Review the booking and try the move again.';
  }
}

export function projectedCapacityMessage(
  summary: TodayProductionSummary,
  bookingHours: number,
): { tone: 'neutral' | 'warning' | 'danger'; message: string } {
  if (summary.isClosed) {
    return { tone: 'danger', message: 'Today is marked closed. Moving the booking is still allowed.' };
  }
  if (!summary.capacityKnown || summary.availableHours === null) {
    return { tone: 'warning', message: "Today’s capacity is unavailable. The move is still allowed." };
  }
  if (summary.plannedHours === null) {
    return { tone: 'warning', message: 'Today’s planned hours are incomplete. The move is still allowed.' };
  }
  const projectedOverload = summary.plannedHours + bookingHours - summary.availableHours;
  if (projectedOverload > 0) {
    return { tone: 'warning', message: `Moving this booking will put today approximately ${projectedOverload.toFixed(2)} hours over capacity.` };
  }
  return { tone: 'neutral', message: `Projected remaining capacity: ${Math.max(0, -projectedOverload).toFixed(2)} hours.` };
}
