import { parseGlassUnitConfiguration } from './glass-unit-composition-contract';

export type DoubleDoorAstragalType = 'standard-metal-ds347' | 'wood-ferco-astra-lock';
export const DEFAULT_DOUBLE_DOOR_ASTRAGAL: DoubleDoorAstragalType = 'standard-metal-ds347';
export const DOUBLE_DOOR_ASTRAGALS = {
  'standard-metal-ds347': { width: 0.75, label: 'Standard Metal — DS347 — 3/4"' },
  'wood-ferco-astra-lock': { width: 1, label: 'Wood + Ferco Astra Lock — 1"' },
} as const;

export function normalizeDoubleDoorAstragal(value: unknown): DoubleDoorAstragalType {
  return value === 'wood-ferco-astra-lock' ? value : DEFAULT_DOUBLE_DOOR_ASTRAGAL;
}

export function hasDoubleDoorCore(config: unknown): boolean {
  const parsed = parseGlassUnitConfiguration(config);
  return parsed.ok ? parsed.value.door === 'DD' : String(config ?? '').trim() === 'DD';
}

export function doubleDoorAstragalWidth(value: unknown): number {
  return DOUBLE_DOOR_ASTRAGALS[normalizeDoubleDoorAstragal(value)].width;
}

/** Leaf widths, astragal, and the independent frame/clearance allowance form the DD core. */
export function doubleDoorCoreWidth(leafWidths: readonly number[], astragal: unknown, nonAstragalAllowance: number): number {
  return leafWidths.reduce((sum, width) => sum + width, 0) + doubleDoorAstragalWidth(astragal) + nonAstragalAllowance;
}
