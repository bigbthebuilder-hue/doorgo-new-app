// Display-only vocabulary. Internal/persisted statuses and eligibility remain unchanged.
export function statusLabel(status: unknown): string {
  if (status === 'Glass Detail Needed') return 'Details Needed';
  if (status === 'Manual Override') return 'Geometry Exception Approved';
  if (status === 'Unsupported') return 'Unsupported Configuration';
  return String(status ?? '');
}

export function hasVisibleStatus(status: unknown): boolean {
  return Boolean(status && status !== 'Ready' && status !== 'Not Needed');
}

export function missingDoorFieldMessage(field: string): string {
  const labels: Record<string, string> = {
    mode: 'Door mode', config: 'Configuration', width: 'Slab width', height: 'Slab height',
    customSlabWidth: 'Actual slab width', customSlabHeight: 'Actual slab height',
  };
  return labels[field] ? labels[field] + ' is required.' : 'Required door information is missing.';
}
