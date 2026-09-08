import type { DoorLineInput } from './job-intake-types';

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
