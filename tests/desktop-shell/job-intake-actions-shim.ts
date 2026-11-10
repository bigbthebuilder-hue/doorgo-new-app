import { applyManualGeometryOverride, removeManualGeometryOverride } from '@/lib/jobs/glass-geometry-contract';
import type { DoorLineInput, GlassGeometryValues } from '@/lib/jobs/job-intake-types';

export async function prepareGlassOverrideAction(request: { line: DoorLineInput; acceptedValues: GlassGeometryValues; reason: string }) {
  if (request.reason === 'Slow approval') await new Promise((resolve) => setTimeout(resolve, 400));
  try {
    return { ok: true as const, approval: applyManualGeometryOverride({ ...request, accessLevel: 'use', actorUserId: 'fixture', actorDisplayName: 'Fixture Approver', appliedAt: '2026-09-28T12:00:00Z' }) };
  } catch (error) { return { ok: false as const, message: String(error) }; }
}
export async function removeGlassOverrideAction() { return { ok: true as const, approval: removeManualGeometryOverride('use') }; }
export async function createDraftJobAction() { return { ok: false as const, message: 'Not available in component layout tests.' }; }
export async function createTransferredJobAction() { return { ok: false as const, message: 'Not available in component layout tests.' }; }
export async function updateDraftJobAction() { return { ok: false as const, message: 'Not available in component layout tests.' }; }
export async function archiveDraftJobAction() { return { ok: false as const, message: 'Not available in component layout tests.' }; }
export async function deleteDraftJobAction() { return { ok: false as const, message: 'Not available in component layout tests.' }; }

export async function checkSalesOrderAction(value: string, internalJobId?: string) {
  const fixture = globalThis as typeof globalThis & { salesOrderChecks?: string[] };
  (fixture.salesOrderChecks ??= []).push(value);
  if (value === 'SLOW-DUPLICATE') await new Promise((resolve) => setTimeout(resolve, 300));
  if (value === 'UNAVAILABLE') return { ok: false as const, message: 'Could not check Sales Order. Leave the field again to retry.' };
  return { ok: true as const, duplicate: value === 'DUPLICATE' || value === 'SLOW-DUPLICATE' || (value === 'DG-000123' && internalJobId !== '11111111-1111-4111-8111-111111111111') };
}

export async function loadShopDateAvailabilityAction(month: string, internalJobId: string | null, estimatedHours: number | null) {
  const fixture = globalThis as typeof globalThis & { shopCapacityRequests?: [string, string | null, number | null][] };
  (fixture.shopCapacityRequests ??= []).push([month, internalJobId, estimatedHours]);
  return {
    [`${month}-10`]: (internalJobId ? (estimatedHours ?? 0) <= 4 ? 'fits' : 'exceeds' : 'full') as 'fits' | 'exceeds' | 'full',
    [`${month}-11`]: 'unavailable' as const,
  };
}
