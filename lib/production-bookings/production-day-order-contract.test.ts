import assert from 'node:assert/strict';
import type { CurrentDoorGoAccess } from '../auth/access';
import { canReorderProductionDay, executeReorderProductionDay, normalizeProductionDayOrderResponse, validateReorderProductionDayRequest } from './production-day-order-contract';

const access = (calendar: 'none' | 'view' | 'use', production: 'none' | 'view' | 'use'): CurrentDoorGoAccess => ({ state: 'active', user: { id: 'user', email: null }, profile: { userId: 'user', displayName: 'User', active: true, isManager: false, companyLocation: null, mustChangePassword: false }, permissions: { calendar, production } });
assert.equal(canReorderProductionDay(access('use', 'use')), true);
assert.equal(canReorderProductionDay(access('view', 'use')), false);
assert.equal(canReorderProductionDay(access('use', 'view')), false);

const request = { productionDate: '2026-08-24', expectedBookingIds: ['a', 'b'], orderedBookingIds: ['b', 'a'] };
assert.equal(validateReorderProductionDayRequest(request), true);
assert.equal(validateReorderProductionDayRequest({ ...request, orderedBookingIds: ['a', 'a'] }), false);
assert.equal(validateReorderProductionDayRequest({ ...request, expectedBookingIds: ['a'] }), false);

const rows = [{ booking_id: 'b', day_order: '1024', updated_at: '2026-08-20T12:00:00Z' }, { booking_id: 'a', day_order: 2048, updated_at: '2026-08-20T12:00:00Z' }];
assert.deepEqual(normalizeProductionDayOrderResponse(rows)?.map((item) => item.bookingId), ['b', 'a']);
async function run() {
  let parameters: Record<string, unknown> | null = null;
  const result = await executeReorderProductionDay(request, async (name, input) => { assert.equal(name, 'reorder_production_day'); parameters = input; return { data: rows, error: null }; });
  assert.equal(result.ok, true);
  assert.deepEqual(parameters, { p_production_date: '2026-08-24', p_expected_booking_ids: ['a', 'b'], p_ordered_booking_ids: ['b', 'a'] });
  const stale = await executeReorderProductionDay(request, async () => ({ data: null, error: { message: 'production_day_order.stale_day' } }));
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, 'stale_day');
  console.log('Production day ordering contract tests passed');
}

void run();
