import { normalizeConstruction } from './construction-contract';
import type { DoorLineInput, DoorLineMode } from './job-intake-types';
import { defaultDoorLine, prepAfterHeightChange } from './door-line-contract';
import { hingeTypeOptions } from './hinge-contract';
import { hasDoubleDoorCore } from './double-door-astragal-contract';
import { isGlassConfiguration } from './glass-geometry-contract';

// Sizing modes share existing persisted flags; switching discards inactive inputs.
export function changeSizingMode(line: DoorLineInput, mode: 'No' | 'WoodCustom' | 'RO'): DoorLineInput {
  return {
    ...line, customSlab: mode, customSlabWidth: '', customSlabHeight: '',
    roWidth: isGlassConfiguration(line.config) ? line.roWidth : '',
    roHeight: isGlassConfiguration(line.config) ? line.roHeight : '',
    doubleDoorSizing: mode === 'WoodCustom' && hasDoubleDoorCore(line.config)
      ? { kind: 'custom-slabs', activeWidth: '', inactiveWidth: '', height: '' }
      : line.doubleDoorSizing?.kind === 'patio' ? line.doubleDoorSizing : null,
    glassCalc: null, glassOverride: null, glassWarnings: [], glassBlockers: [],
    glassUnits: [], panelSidelights: [], glassWorkorderDetail: null, vendorCopyText: null,
  };
}

type StickyDoorValues = Pick<DoorLineInput, 'doorType' | 'hingeType' | 'height' | 'construction'>;
export type NewDoorSession = { mode: DoorLineMode; values: Record<DoorLineMode, StickyDoorValues> };

function stickyValues(line: DoorLineInput): StickyDoorValues {
  return { doorType: line.doorType, hingeType: line.hingeType, height: line.height, construction: normalizeConstruction(line.construction) };
}

export function createNewDoorSession(): NewDoorSession {
  return { mode: 'Exterior', values: {
    Interior: stickyValues(defaultDoorLine('Interior')),
    Exterior: stickyValues(defaultDoorLine('Exterior')),
  } };
}

// Only new-door events may write session memory; saved-line edits are isolated.
export function rememberNewDoor(session: NewDoorSession, line: DoorLineInput, editingLineId: string | null): NewDoorSession {
  if (editingLineId !== null) return session;
  const mode = line.mode === 'Interior' ? 'Interior' : 'Exterior';
  const values = stickyValues(line);
  // PKT/B.P. clear the editor hinge without erasing the remembered framed-door choice.
  if (!hingeTypeOptions(mode).includes(String(values.hingeType ?? ''))) values.hingeType = session.values[mode].hingeType;
  return { mode, values: { ...session.values, [mode]: values } };
}

export function newDoorFromSession(session: NewDoorSession, mode = session.mode): DoorLineInput {
  const next = { ...defaultDoorLine(mode), ...session.values[mode] };
  next.prep = prepAfterHeightChange(mode, String(next.config), next.prep, next.height);
  return next;
}

export function isSameDoorMode(line: DoorLineInput, mode: DoorLineMode): boolean {
  return line.mode === mode;
}

export function replaceDoorLineById(lines: readonly DoorLineInput[], editingLineId: string, saved: DoorLineInput): DoorLineInput[] {
  if (!editingLineId || saved.lineId !== editingLineId) throw new Error('Door line identity cannot change during an edit.');
  const matches = lines.filter((line) => line.lineId === editingLineId).length;
  if (matches !== 1) throw new Error('The edited door line identity is missing or duplicated. Reload and review the job.');
  return lines.map((line) => line.lineId === editingLineId ? structuredClone(saved) : line);
}

export function duplicateDoorLine(line: DoorLineInput, newLineId: string, lineIndex: number): DoorLineInput {
  if (!newLineId || newLineId === line.lineId) throw new Error('A duplicated door line requires a new identity.');
  return {
    ...structuredClone(line),
    lineId: newLineId,
    lineStatus: 'Active',
    lineIndex,
    glassOverride: null,
    glassCalcStatus: line.glassCalcStatus === 'Manual Override' ? 'Warning' : line.glassCalcStatus,
  };
}
