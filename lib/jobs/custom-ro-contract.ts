import type { DoorLineInput } from './job-intake-types';

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
