import type { DoorLineInput } from './job-intake-types';

export const isSlabOnly = (line: DoorLineInput) => line.supplyType === 'slab-only';
export const SLAB_DRILLING = ['STD', 'SINGLE', 'MULTI', 'YES', 'NO', 'BOTH', 'HALF', 'Round Weiser', 'Reg Emtek', 'LRG Emtek'] as const;
export function drillingDisplay(value: unknown): string {
  const code = String(value ?? '');
  return ({ STD: 'Double drilled', SINGLE: 'Single drilled', MULTI: 'Multipoint', YES: 'Single drilled', NO: 'None', BOTH: 'Both doors drilled', HALF: 'Half drill for finger pulls' } as Record<string, string>)[code] ?? code;
}
export function preparationDisplay(line: DoorLineInput): string {
  return line.prep === 'MTM' ? ['MTM — Machine to Match', drillingDisplay(line.slabDrilling)].filter(Boolean).join('; ') : drillingDisplay(line.prep);
}
// Frame values stay in their existing fields. Only optional slab hand/prep start empty.
export function changeSupplyType(line: DoorLineInput, supplyType: 'prehung' | 'slab-only'): DoorLineInput {
  if (isSlabOnly(line) === (supplyType === 'slab-only')) return line;
  if (supplyType === 'slab-only') return { ...line, supplyType, framePreparation: { hand: line.hand ?? null, prep: line.prep ?? null, prepSource: line.prepSource === 'automatic' ? 'automatic' : 'manual' }, hand: line.slabPreparation?.hand ?? null, prep: line.slabPreparation?.prep ?? null, prepSource: 'manual', slabDrilling: line.slabPreparation?.slabDrilling ?? null };
  return { ...line, supplyType, slabPreparation: { hand: line.hand ?? null, prep: line.prep ?? null, slabDrilling: line.slabDrilling ?? null }, hand: line.framePreparation?.hand ?? null, prep: line.framePreparation?.prep ?? null, prepSource: line.framePreparation?.prepSource ?? 'manual', framePreparation: null, slabDrilling: null };
}
