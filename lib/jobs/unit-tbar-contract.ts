import type { DoorLineInput, GlassTBarSize } from './job-intake-types';
import { parseGlassUnitConfiguration } from './glass-unit-composition-contract';
import { automaticUnitTBar, normalizeTBarSize } from './glass-geometry-contract';

export function unitTBarControl(line: DoorLineInput): { source: 'automatic' | 'manual'; size: GlassTBarSize } {
  const control = line.unitTBarControl;
  if (control?.source === 'automatic') return { source: 'automatic', size: automaticUnitTBar(String(line.config)) };
  const storedTransom = line.glassCalc?.transomTBar;
  const storedSides = line.glassCalc?.resolvedSidelights;
  const explicit = normalizeTBarSize(control?.size) ?? normalizeTBarSize(line.transomTBarSize)
    ?? line.sidelightSpecifications?.map(entry => normalizeTBarSize(entry.tBarSize)).find(Boolean)
    ?? normalizeTBarSize(storedTransom && typeof storedTransom === 'object' && 'resolvedSize' in storedTransom ? storedTransom.resolvedSize : null)
    ?? (Array.isArray(storedSides) ? storedSides.map(entry => normalizeTBarSize('tBar' in entry ? entry.tBar.resolvedSize : null)).find(Boolean) : null);
  // Values saved before provenance existed are protected, never reinterpreted.
  return explicit ? { source: 'manual', size: explicit } : { source: 'automatic', size: automaticUnitTBar(String(line.config)) };
}

export function withUnitTBarControl(line: DoorLineInput, previous: DoorLineInput = line): DoorLineInput {
  const control = unitTBarControl(previous);
  const size = control.source === 'automatic' ? automaticUnitTBar(String(line.config)) : control.size;
  const composition = parseGlassUnitConfiguration(line.config);
  return { ...line, unitTBarControl: { source: control.source, size },
    transomTBarSize: composition.ok && composition.value.hasTransom ? size : null,
    sidelightSpecifications: line.sidelightSpecifications?.map(entry => ({ ...entry, tBarSize: size })),
  };
}
