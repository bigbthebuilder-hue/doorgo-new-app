import type { DoorLineInput } from './job-intake-types';

export const CONSTRUCTIONS = {
  standard: { label: 'Standard' },
  'low-profile-quarter-sill': { label: 'Low Profile 1/4" Sill' },
  'jamb-four-sides': { label: 'Jamb 4 sides' },
} as const;
export type DoorConstruction = keyof typeof CONSTRUCTIONS;

export const SILL_CHOICES = ['STD', 'DARK', 'LOW-PRO', 'NONE', 'J-4-S'] as const;
export type SillChoice = typeof SILL_CHOICES[number];
const SILL_CONSTRUCTION: Record<SillChoice, DoorConstruction> = {
  STD: 'standard', DARK: 'standard', 'LOW-PRO': 'low-profile-quarter-sill',
  NONE: 'standard', 'J-4-S': 'jamb-four-sides',
};

// Existing construction is authoritative: legacy free text never selects geometry.
export function sillChoice(line: Readonly<DoorLineInput>): SillChoice {
  const construction = normalizeConstruction(line.construction);
  if (construction === 'low-profile-quarter-sill') return 'LOW-PRO';
  if (construction === 'jamb-four-sides') return 'J-4-S';
  const stored = String(line.sill ?? '').trim();
  return stored === 'DARK' || stored === 'NONE' ? stored : 'STD';
}

export function withSillChoice(line: DoorLineInput, sill: SillChoice): DoorLineInput {
  const hand = line.mode === 'Interior' && sill !== 'LOW-PRO'
    ? line.hand === 'LHOUT' ? 'LH' : line.hand === 'RHOUT' ? 'RH' : line.hand
    : line.hand;
  return { ...line, sill, construction: SILL_CONSTRUCTION[sill], hand };
}

export function normalizeConstruction(value: unknown): DoorConstruction {
  return value === 'low-profile-quarter-sill' || value === 'jamb-four-sides' ? value : 'standard';
}

export function validConstruction(value: unknown): boolean {
  return value == null || value === '' || value === 'standard' || value === 'low-profile-quarter-sill' || value === 'jamb-four-sides';
}

// Side jamb thickness shared by standard, LOW-PRO, and four-side frames.
export const SIDE_JAMB_THICKNESS = 0.75;
export const FOUR_SIDE_JAMB = { thickness: SIDE_JAMB_THICKNESS, slabClearance: 0.125, recommendedInstallation: 0.5, minimumInstallation: 0.25 } as const;

export function isFourSideJamb(line: Readonly<DoorLineInput>): boolean {
  return normalizeConstruction(line.construction) === 'jamb-four-sides';
}

// Construction supplies an allowance, independently of RO cut decisions and T-bars.
// The caller may preserve an established Standard allowance for its construction path.
export function constructionAllowance(construction: unknown, outswing: boolean, standardAllowance?: number): number {
  if (normalizeConstruction(construction) === 'jamb-four-sides') return 2 * (FOUR_SIDE_JAMB.thickness + FOUR_SIDE_JAMB.slabClearance);
  return normalizeConstruction(construction) === 'low-profile-quarter-sill'
    ? 1.625 : standardAllowance ?? (outswing ? 2 : 2.25);
}

export function lowProfileLabel(line: Readonly<DoorLineInput>): string | null {
  return normalizeConstruction(line.construction) === 'low-profile-quarter-sill'
    ? CONSTRUCTIONS['low-profile-quarter-sill'].label : null;
}
