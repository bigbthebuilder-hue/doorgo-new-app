import type { DoorLineInput } from './job-intake-types';
import { normalizeConstruction } from './construction-contract';
import { usesCustomRo } from './custom-ro-contract';
import { parseStoredShopDimension, type DimensionParseResult } from './dimension-contract';
import { isSlabOnly } from './slab-only-contract';

export function usesInteriorRoSizing(line: Readonly<DoorLineInput>): boolean {
  return usesInteriorBottomGap(line) && usesCustomRo(line);
}
export function usesInteriorBottomGap(line: Readonly<DoorLineInput>): boolean {
  return line.mode === 'Interior' && (line.config === 'D' || line.config === 'DD')
    && line.doubleDoorSizing?.kind !== 'patio' && line.prep !== 'MTM' && !isSlabOnly(line)
    && normalizeConstruction(line.construction) === 'standard';
}
export function gapUnderDoor(value: unknown): DimensionParseResult {
  if (value == null || String(value).trim() === '') return { ok: true, inches: 1, formatted: '1"' };
  if (/^0(?:\.0+)?\s*["″]?$/.test(String(value).trim())) return { ok: true, inches: 0, formatted: '0"' };
  return parseStoredShopDimension(value);
}

// Jambs depend on the opening and standard assembly, never on the optional gap.
// Smaller gaps cannot manufacture a taller source slab; retain full-height stock.
export function resolveInteriorRoHeight(slabHeight: number, roHeight: number | null, bottomGap: number) {
  const headerAndTop = 0.75 + 0.125;
  const normalJamb = slabHeight + headerAndTop + 1;
  const jambLeg = roHeight === null ? normalJamb : Math.min(normalJamb, roHeight - 0.5);
  const finalSlabHeight = Math.min(slabHeight, jambLeg - headerAndTop - bottomGap);
  return { jambLeg, finalSlabHeight, cutDown: Math.max(0, slabHeight - finalSlabHeight), effectiveBottomGap: jambLeg - headerAndTop - finalSlabHeight };
}

// Standard and Custom Slab keep the slab fixed and build the jamb around it.
export function resolveInteriorSlabHeight(slabHeight: number, bottomGap: number) {
  return { jambLeg: slabHeight + 0.75 + 0.125 + bottomGap, finalSlabHeight: slabHeight, cutDown: 0, effectiveBottomGap: bottomGap };
}
