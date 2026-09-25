import type { DoorLineInput } from './job-intake-types';
import { doubleDoorCoreWidth } from './double-door-astragal-contract';

// Shared by plain DD and DD-based glass units. Sidelights occupy the remainder
// of the header; only the inactive slab may absorb a routine door-core reduction.
export function resolveCustomRoDoubleDoorWidth(leaves: readonly [number, number], astragal: unknown, allowance: number, roWidth: number | null, sidelightSpan = 0) {
  const normalHeader = doubleDoorCoreWidth(leaves, astragal, allowance) + sidelightSpan;
  const targetHeader = customRoHeaderTarget(normalHeader, roWidth);
  const requiredReduction = Math.max(0, normalHeader - targetHeader);
  const reviewRequired = requiredReduction > 2;
  const widthCut = reviewRequired ? 0 : requiredReduction;
  const resolvedLeaves: readonly [number, number] = [leaves[0], leaves[1] - widthCut];
  return { targetHeader, requiredReduction, reviewRequired, widthCut, leaves: resolvedLeaves };
}

export function usesCustomRo(line: Readonly<DoorLineInput>): boolean {
  return (line.mode === 'Interior' || line.mode === 'Exterior')
    && (line.config === 'D' || line.config === 'DD')
    && line.customSlab === 'RO' && line.doubleDoorSizing?.kind !== 'patio';
}

// Height only: a normal unit may stay uncut with 1/4 inch installation room. Once cutting
// is necessary, use the preferred 1/2 inch total gap, never enlarge the unit.
export function customRoTarget(normalFinishedSize: number, ro: number | null): number {
  return ro === null || ro >= normalFinishedSize + 0.25 ? normalFinishedSize : ro - 0.5;
}

// Width always needs 1/2 inch total installation clearance plus two 3/4 inch jambs.
export function customRoHeaderTarget(normalHeader: number, roWidth: number | null): number {
  return roWidth === null ? normalHeader : Math.min(normalHeader, roWidth - 2);
}

export function resolveCustomRoHeight(slabHeight: number, allowance: number, roHeight: number | null) {
  const jambLeg = customRoTarget(slabHeight + allowance, roHeight);
  const finalSlabHeight = jambLeg - allowance;
  return { jambLeg, finalSlabHeight, cutDown: slabHeight - finalSlabHeight };
}
