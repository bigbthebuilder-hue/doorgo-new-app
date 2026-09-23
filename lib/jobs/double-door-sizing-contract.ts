import type { DoorLineInput, DoubleDoorSizing } from './job-intake-types';
import { hasDoubleDoorCore } from './double-door-astragal-contract';

export const PATIO_DOOR_PRESETS = {
  '5': { activeWidth: 28.5, inactiveWidth: 28.5, height: 77, referenceWidth: 60, referenceHeight: 80 },
  '6': { activeWidth: 34.5, inactiveWidth: 34.5, height: 77, referenceWidth: 72, referenceHeight: 80 },
} as const;

export function patioSizingAvailable(line: Pick<DoorLineInput, 'mode' | 'config'>): boolean {
  return line.mode === 'Exterior' && line.config === 'DD';
}

export function validateDoubleDoorSizing(line: Pick<DoorLineInput, 'mode' | 'config' | 'doubleDoorSizing'>): string | null {
  const sizing = line.doubleDoorSizing;
  if (sizing == null) return null;
  if (!hasDoubleDoorCore(line.config)) return 'Explicit leaf sizing requires a DD configuration.';
  if (sizing.kind === 'patio') {
    return patioSizingAvailable(line) && (sizing.preset === '5' || sizing.preset === '6')
      ? null : 'Patio Door Replacement requires Exterior DD and a 5\' or 6\' preset.';
  }
  if (sizing.kind !== 'actual-leaves' || ![sizing.activeWidth, sizing.inactiveWidth].every(
    (width) => typeof width === 'number' && Number.isFinite(width) && width > 0 && Number.isInteger(width * 16),
  )) return 'DD actual leaf widths must be positive inches in 1/16-inch increments.';
  return null;
}

export function resolvedDoubleDoorLeaves(sizing: DoubleDoorSizing | null | undefined, defaultWidth: number): readonly [number, number] {
  if (sizing?.kind === 'patio') {
    const preset = PATIO_DOOR_PRESETS[sizing.preset];
    return [preset.activeWidth, preset.inactiveWidth];
  }
  return sizing?.kind === 'actual-leaves' ? [sizing.activeWidth, sizing.inactiveWidth] : [defaultWidth, defaultWidth];
}

// Changing sizing discards only dimensions belonging to the previous sizing choice.
export function withPatioPreset(line: DoorLineInput, preset: '5' | '6' | null): DoorLineInput {
  return { ...line, doubleDoorSizing: preset ? { kind: 'patio', preset } : null,
    customSlab: 'No', customSlabWidth: '', customSlabHeight: '', roWidth: '', roHeight: '',
    glassCalc: null, glassOverride: null, glassWarnings: [], glassBlockers: [],
  };
}
