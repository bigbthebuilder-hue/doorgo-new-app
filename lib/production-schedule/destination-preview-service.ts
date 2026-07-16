import 'server-only';

import { getPermissionAccess } from '@/lib/auth/access';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { loadDailyCapacityReadOnly } from '@/lib/production-board/capacity-queries';
import { createTrustedReadOnlySupabaseClient } from '@/lib/supabase/trusted-read-server';
import { addDaysToDateOnly } from '../production-board/date-utils';
import {
  isValidProductionScheduleDate,
  type ProductionScheduleDestinationPreviewResult,
} from './move-ui-contract';

export type ProductionScheduleDestinationPreviewRequest = {
  bookingId: string;
  expectedProductionDate: string;
  destinationProductionDate: string;
};

const allowedKeys = new Set([
  'bookingId',
  'expectedProductionDate',
  'destinationProductionDate',
]);

function failure(
  code: Extract<ProductionScheduleDestinationPreviewResult, { ok: false }>['code'],
): ProductionScheduleDestinationPreviewResult {
  const messages = {
    invalid_request: 'Choose a valid production date.',
    stale_booking: 'This booking was changed elsewhere. The schedule has been refreshed.',
    permission_required: 'Production access is required to preview this move.',
    unavailable: 'Destination capacity could not be confirmed. You can cancel or try again.',
  } as const;
  return { ok: false, code, message: messages[code] };
}

function parseHours(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '') return null;
  const text = String(value);
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const hours = Number(text);
  return Number.isFinite(hours) && hours >= 0 && hours <= 99_999_999.99 ? hours : null;
}

function validatePreviewRequest(input: unknown): ProductionScheduleDestinationPreviewRequest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.has(key)) ||
    typeof record.bookingId !== 'string' || !record.bookingId ||
    record.bookingId !== record.bookingId.trim() || record.bookingId.length > 500 ||
    !isValidProductionScheduleDate(record.expectedProductionDate) ||
    !isValidProductionScheduleDate(record.destinationProductionDate) ||
    record.expectedProductionDate === record.destinationProductionDate) return null;
  return record as ProductionScheduleDestinationPreviewRequest;
}

export async function loadProductionScheduleDestinationPreview(
  input: unknown,
): Promise<ProductionScheduleDestinationPreviewResult> {
  try {
    const request = validatePreviewRequest(input);
    if (!request) return failure('invalid_request');

    const access = await getCurrentDoorGoAccess();
    if (access.state !== 'active' || getPermissionAccess(access, 'production') === 'none') {
      return failure('permission_required');
    }

    const supabase = createTrustedReadOnlySupabaseClient();
    const [bookingResult, destinationResult, capacityRows] = await Promise.all([
      supabase
        .from('dg_production_bookings')
        .select('booking_id, production_date, shop_hours, booking_kind, status, schedule_status, board_visible, locked, completed_at, cancelled_at, deleted_at')
        .eq('booking_id', request.bookingId)
        .maybeSingle(),
      supabase
        .from('dg_production_bookings')
        .select('shop_hours')
        .eq('production_date', request.destinationProductionDate)
        .is('deleted_at', null)
        .is('cancelled_at', null)
        .eq('status', 'active')
        .eq('schedule_status', 'confirmed')
        .neq('board_visible', false),
      loadDailyCapacityReadOnly({
        startDate: request.destinationProductionDate,
        endDateExclusive: addDaysToDateOnly(request.destinationProductionDate, 1),
      }),
    ]);

    if (bookingResult.error || destinationResult.error) return failure('unavailable');
    const booking = bookingResult.data as Record<string, unknown> | null;
    const bookingHours = parseHours(booking?.shop_hours);
    if (!booking || booking.production_date !== request.expectedProductionDate) return failure('stale_booking');
    if (booking.booking_kind !== 'production' || booking.status !== 'active' ||
      booking.schedule_status !== 'confirmed' || booking.board_visible === false ||
      booking.locked === true || booking.completed_at !== null ||
      booking.cancelled_at !== null || booking.deleted_at !== null || bookingHours === null) {
      return failure('stale_booking');
    }

    const destinationHours = (destinationResult.data ?? []).map((row) => parseHours(row.shop_hours));
    const currentPlannedHours = destinationHours.some((hours) => hours === null)
      ? null
      : destinationHours.reduce<number>((sum, hours) => sum + (hours ?? 0), 0);
    const projectedPlannedHours = currentPlannedHours === null
      ? null
      : currentPlannedHours + bookingHours;
    const capacity = capacityRows[0] ?? null;
    const isClosed = capacity?.isClosed === true;
    const availableHours = isClosed ? 0 : capacity?.availableHours ?? null;
    const capacityKnown = isClosed || Boolean(
      capacity && capacity.source !== 'unknown' && availableHours !== null,
    );

    return {
      ok: true,
      preview: {
        productionDate: request.destinationProductionDate,
        currentPlannedHours,
        bookingHours,
        projectedPlannedHours,
        availableHours,
        capacityKnown,
        isClosed,
        overload: capacityKnown && availableHours !== null &&
          projectedPlannedHours !== null && projectedPlannedHours > availableHours,
      },
    };
  } catch {
    return failure('unavailable');
  }
}
