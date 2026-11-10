export const shopDateCapacityLabels = {
  fits: 'Fits',
  exceeds: 'Would exceed',
  full: 'Full or over capacity',
  unavailable: 'Closed or unavailable',
} as const;

export type ShopDateIndicator = keyof typeof shopDateCapacityLabels;
export type ShopDateIndicators = Record<string, ShopDateIndicator>;

function hourUnits(hours: number | null): number | null {
  if (hours === null) return null;
  const value = hours;
  const units = Math.round(value * 100);
  return value >= 0 && Number.isSafeInteger(units) ? units : null;
}

export function shopDateCapacityStatus(
  remaining: number | 'closed' | null,
  estimatedHours: number | null,
): ShopDateIndicator {
  if (remaining == null || remaining === 'closed') return 'unavailable';
  if (remaining === 0) return 'full';
  const estimate = hourUnits(estimatedHours);
  if (estimate === null) return 'unavailable';
  return estimate <= remaining ? 'fits' : 'exceeds';
}
