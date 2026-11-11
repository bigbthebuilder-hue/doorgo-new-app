import { PATIO_DOOR_PRESETS } from './double-door-sizing-contract';
import { parseStoredShopDimension } from './dimension-contract';
import type { NativeDoorLine } from './job-intake-types';
import { customSlabAxis, hasCustomSlabAxis } from './slab-sizing-contract';

const text = (value: unknown) => String(value ?? '').trim();

export function canonicalStoredDimension(value: unknown): string {
  const parsed = parseStoredShopDimension(value);
  return parsed.ok ? parsed.formatted : text(value);
}

export function doorSizeDisplay(line: NativeDoorLine, includeStandardHeight = false): string {
  if (line.doubleDoorSizing?.kind === 'custom-slabs') {
    const sizing = line.doubleDoorSizing;
    return `Active: ${canonicalStoredDimension(sizing.activeWidth)} x ${canonicalStoredDimension(sizing.height)}; Inactive: ${canonicalStoredDimension(sizing.inactiveWidth)} x ${canonicalStoredDimension(sizing.height)}`;
  }
  if (line.doubleDoorSizing?.kind === 'patio') {
    const preset = PATIO_DOOR_PRESETS[line.doubleDoorSizing.preset];
    if (preset) return `2 @ ${canonicalStoredDimension(preset.activeWidth)} x ${canonicalStoredDimension(preset.height)}`;
  }
  if (hasCustomSlabAxis(line)) {
    const width = customSlabAxis(line, 'width') ? canonicalStoredDimension(line.customSlabWidth) || 'Not entered' : text(line.width);
    const height = customSlabAxis(line, 'height') ? canonicalStoredDimension(line.customSlabHeight) || 'Not entered' : text(line.height);
    return width + ' × ' + height;
  }
  if (includeStandardHeight && (!text(line.width) || !text(line.height))) return text(line.width) || text(line.height);
  if (!includeStandardHeight && text(line.height) === `6'8"`) return text(line.width);
  return `${text(line.width)} × ${text(line.height)}`;
}
