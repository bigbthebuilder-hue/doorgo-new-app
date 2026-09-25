import type { DoorLineInput } from './job-intake-types';

export const CONSTRUCTIONS = {
  standard: { label: 'Standard' },
  'low-profile-quarter-sill': { label: 'Low Profile 1/4" Sill' },
} as const;
export type DoorConstruction = keyof typeof CONSTRUCTIONS;

export function normalizeConstruction(value: unknown): DoorConstruction {
  return value === 'low-profile-quarter-sill' ? value : 'standard';
}

export function validConstruction(value: unknown): boolean {
  return value == null || value === '' || value === 'standard' || value === 'low-profile-quarter-sill';
}

// Construction supplies an allowance, independently of RO cut decisions and T-bars.
// The caller may preserve an established Standard allowance for its construction path.
export function constructionAllowance(construction: unknown, outswing: boolean, standardAllowance?: number): number {
  return normalizeConstruction(construction) === 'low-profile-quarter-sill'
    ? 1.625 : standardAllowance ?? (outswing ? 2 : 2.25);
}

export function lowProfileLabel(line: Readonly<DoorLineInput>): string | null {
  return normalizeConstruction(line.construction) === 'low-profile-quarter-sill'
    ? CONSTRUCTIONS['low-profile-quarter-sill'].label : null;
}
