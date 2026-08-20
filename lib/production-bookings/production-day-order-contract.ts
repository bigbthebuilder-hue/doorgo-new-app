import type { CurrentDoorGoAccess } from '../auth/access';
import { getPermissionAccess } from '../auth/access';

export const PRODUCTION_DAY_ORDER_RPC = 'reorder_production_day';

export type ReorderProductionDayRequest = {
  productionDate: string;
  expectedBookingIds: string[];
  orderedBookingIds: string[];
};

export type ProductionDayOrderItem = {
  bookingId: string;
  dayOrder: number;
  updatedAt: string;
};

export type ProductionDayOrderErrorCode =
  | 'authentication_required' | 'active_profile_required' | 'permission_required'
  | 'invalid_request' | 'invalid_order' | 'stale_day' | 'malformed_response' | 'unavailable';

export type ProductionDayOrderResult =
  | { ok: true; items: ProductionDayOrderItem[] }
  | { ok: false; code: ProductionDayOrderErrorCode; message: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

export function canReorderProductionDay(access: CurrentDoorGoAccess): boolean {
  return getPermissionAccess(access, 'calendar') === 'use'
    && getPermissionAccess(access, 'production') === 'use';
}

export function validateReorderProductionDayRequest(input: unknown): input is ReorderProductionDayRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some((key) => !['productionDate', 'expectedBookingIds', 'orderedBookingIds'].includes(key))
    || typeof value.productionDate !== 'string' || !DATE.test(value.productionDate)
    || !Array.isArray(value.expectedBookingIds) || !Array.isArray(value.orderedBookingIds)) return false;
  const validIds = (ids: unknown[]) => ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 500 && id === id.trim())
    && new Set(ids).size === ids.length;
  return validIds(value.expectedBookingIds) && validIds(value.orderedBookingIds)
    && value.expectedBookingIds.length === value.orderedBookingIds.length;
}

const messages: Record<ProductionDayOrderErrorCode, string> = {
  authentication_required: 'Sign in before reordering production.',
  active_profile_required: 'An active DoorGo profile is required.',
  permission_required: 'Calendar and Production use permission are required.',
  invalid_request: 'The Production day order request is invalid.',
  invalid_order: 'The Production day order does not match the current day.',
  stale_day: 'This day changed elsewhere. It has been refreshed; try again.',
  malformed_response: 'The saved Production day order could not be verified.',
  unavailable: 'The Production day could not be reordered. Please try again.',
};

export function productionDayOrderFailure(code: ProductionDayOrderErrorCode): ProductionDayOrderResult {
  return { ok: false, code, message: messages[code] };
}

export function mapProductionDayOrderError(error: unknown): ProductionDayOrderResult {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : '';
  const prefix = 'production_day_order.';
  const code = message.startsWith(prefix) ? message.slice(prefix.length) as ProductionDayOrderErrorCode : 'unavailable';
  return productionDayOrderFailure(code in messages ? code : 'unavailable');
}

export function normalizeProductionDayOrderResponse(value: unknown): ProductionDayOrderItem[] | null {
  if (!Array.isArray(value)) return null;
  const items: ProductionDayOrderItem[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const item = row as Record<string, unknown>;
    const order = Number(item.day_order);
    if (typeof item.booking_id !== 'string' || !item.booking_id || !Number.isSafeInteger(order) || order < 1
      || typeof item.updated_at !== 'string' || !TIMESTAMP.test(item.updated_at) || Number.isNaN(Date.parse(item.updated_at))) return null;
    items.push({ bookingId: item.booking_id, dayOrder: order, updatedAt: item.updated_at });
  }
  return items;
}

export async function executeReorderProductionDay(input: unknown, rpc: (name: typeof PRODUCTION_DAY_ORDER_RPC, parameters: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>): Promise<ProductionDayOrderResult> {
  if (!validateReorderProductionDayRequest(input)) return productionDayOrderFailure('invalid_request');
  const result = await rpc(PRODUCTION_DAY_ORDER_RPC, {
    p_production_date: input.productionDate,
    p_expected_booking_ids: input.expectedBookingIds,
    p_ordered_booking_ids: input.orderedBookingIds,
  });
  if (result.error) return mapProductionDayOrderError(result.error);
  const items = normalizeProductionDayOrderResponse(result.data);
  return items ? { ok: true, items } : productionDayOrderFailure('malformed_response');
}
