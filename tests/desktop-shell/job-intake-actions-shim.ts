export async function prepareGlassOverrideAction() { return { ok: false as const, message: 'Not available in component layout tests.' }; }
export async function removeGlassOverrideAction() { return { ok: false as const, message: 'Not available in component layout tests.' }; }
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
