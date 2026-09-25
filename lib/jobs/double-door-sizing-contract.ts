import type { DoorLineInput, DoubleDoorSizing } from './job-intake-types';
import { hasDoubleDoorCore } from './double-door-astragal-contract';
import { parseStoredShopDimension } from './dimension-contract';

export const CUSTOM_DD_REQUIRED = 'Enter Active width, Inactive width, and shared slab height.';

export function customDoubleDoorSlabs(sizing: DoubleDoorSizing | null | undefined): { activeWidth: number; inactiveWidth: number; height: number } | null {
  if (sizing?.kind !== 'custom-slabs') return null;
  const active = parseStoredShopDimension(sizing.activeWidth);
  const inactive = parseStoredShopDimension(sizing.inactiveWidth);
  const height = parseStoredShopDimension(sizing.height);
  return active.ok && inactive.ok && height.ok
    ? { activeWidth: active.inches, inactiveWidth: inactive.inches, height: height.inches } : null;
}

export const PATIO_DOOR_PRESETS = {
  '5': { activeWidth: 28.5, inactiveWidth: 28.5, height: 77, referenceWidth: 60, referenceHeight: 80 },
  '6': { activeWidth: 34.5, inactiveWidth: 34.5, height: 77, referenceWidth: 72, referenceHeight: 80 },
} as const;

export function patioSizingAvailable(line: Pick<DoorLineInput, 'mode' | 'config'>): boolean {
  return line.mode === 'Exterior' && line.config === 'DD';
}

export function validateDoubleDoorSizing(line: Pick<DoorLineInput, 'mode' | 'config' | 'doubleDoorSizing' | 'customSlab'>): string | null {
  const sizing = line.doubleDoorSizing;
  if (hasDoubleDoorCore(line.config) && ['WoodCustom', 'Yes'].includes(String(line.customSlab)) && sizing?.kind !== 'custom-slabs') return CUSTOM_DD_REQUIRED;
  if (sizing == null) return null;
  if (!hasDoubleDoorCore(line.config)) return 'Explicit leaf sizing requires a DD configuration.';
  if (sizing.kind === 'custom-slabs') return customDoubleDoorSlabs(sizing) ? null : CUSTOM_DD_REQUIRED;
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
  if (sizing?.kind === 'custom-slabs') {
    const custom = customDoubleDoorSlabs(sizing);
    return custom ? [custom.activeWidth, custom.inactiveWidth] : [NaN, NaN];
  }
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
