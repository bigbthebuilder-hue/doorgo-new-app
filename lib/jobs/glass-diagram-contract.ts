import { parseStoredShopDimension } from './dimension-contract';
import { calculateGlassGeometry, glassConfigurationTopology, isGlassConfiguration, normalizeSidelightType } from './glass-geometry-contract';
import type { DoorLineInput, GlassGeometryValues } from './job-intake-types';
import { parseGlassUnitConfiguration } from './glass-unit-composition-contract';

export type GlassDiagramPart = {
  id: string;
  kind: 'door' | 'glass' | 'panel' | 'divider' | 'transom-divider' | 'mullion';
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
};

export type GlassDiagramLayout = {
  width: number;
  height: number;
  dividerWidth: number;
  parts: GlassDiagramPart[];
};

function inches(value: unknown): number {
  const parsed = parseStoredShopDimension(value);
  return parsed.ok ? parsed.inches : 0;
}

/** Authoritative physical layout. All coordinates are inches from calculated geometry. */
export function calculateGlassDiagramLayout(line: DoorLineInput): GlassDiagramLayout | null {
  if (!isGlassConfiguration(line.config)) return null;
  const calculated = calculateGlassGeometry(line);
  return calculated.glassCalc ? diagramLayoutFromValues(line, calculated.glassCalc) : null;
}

/** Saved-output path: consumes persisted J2 values and never recalculates geometry. */
export function calculatePersistedGlassDiagramLayout(line: DoorLineInput): GlassDiagramLayout | null {
  if (!isGlassConfiguration(line.config) || !line.glassCalc) return null;
  return diagramLayoutFromValues(line, line.glassCalc);
}

/** Builder-only pre-measurement schematic. Composition is shared; no business dimensions are inferred. */
export function calculateGlassCompositionSchematic(line: DoorLineInput): GlassDiagramLayout | null {
  const parsed = parseGlassUnitConfiguration(line.config);
  if (!parsed.ok || !isGlassConfiguration(line.config)) return null;
  const type = normalizeSidelightType(line.sidelightType) ?? 'Glass';
  const sideWidth = 20; const dividerWidth = 2; const doorWidth = 40; const doorHeight = 80;
  const transomHeight = parsed.value.hasTransom ? 20 : 0;
  const bodyY = transomHeight ? transomHeight + dividerWidth : 0;
  const width = (parsed.value.leftSidelightCount + parsed.value.rightSidelightCount) * (sideWidth + dividerWidth) + (parsed.value.door === 'DD' ? 2 : 1) * doorWidth;
  const parts: GlassDiagramPart[] = [];
  let x = 0;
  for (let index = 1; index <= parsed.value.leftSidelightCount; index += 1) {
    parts.push({ id: `left-sidelight-${index}`, kind: type === 'Panel' ? 'panel' : 'glass', x, y: bodyY, width: sideWidth, height: doorHeight });
    x += sideWidth;
    parts.push({ id: `left-divider-${index}`, kind: 'divider', x, y: bodyY, width: dividerWidth, height: doorHeight });
    x += dividerWidth;
  }
  for (let index = 1; index <= (parsed.value.door === 'DD' ? 2 : 1); index += 1) {
    parts.push({ id: parsed.value.door === 'DD' ? `${index === 1 ? 'left' : 'right'}-door` : 'door', kind: 'door', x, y: bodyY, width: doorWidth, height: doorHeight });
    x += doorWidth;
  }
  for (let index = 1; index <= parsed.value.rightSidelightCount; index += 1) {
    parts.push({ id: `right-divider-${index}`, kind: 'divider', x, y: bodyY, width: dividerWidth, height: doorHeight });
    x += dividerWidth;
    parts.push({ id: `right-sidelight-${index}`, kind: type === 'Panel' ? 'panel' : 'glass', x, y: bodyY, width: sideWidth, height: doorHeight });
    x += sideWidth;
  }
  if (parsed.value.hasTransom) {
    parts.push({ id: 'transom-divider', kind: 'transom-divider', x: 0, y: transomHeight, width, height: dividerWidth });
    parts.push({ id: 'transom', kind: 'glass', x: 0, y: 0, width, height: transomHeight });
  }
  return { width, height: bodyY + doorHeight, dividerWidth, parts };
}

function diagramLayoutFromValues(line: DoorLineInput, calc: GlassGeometryValues): GlassDiagramLayout | null {
  if (!isGlassConfiguration(line.config)) return null;
  const topology = glassConfigurationTopology(line.config);
  const type = normalizeSidelightType(calc.sidelightType) ?? 'Glass';
  const width = inches(calc.headerWidth);
  const slabWidth = inches(calc.slabWidth);
  const doorHeight = inches(calc.finalDoorHeight || calc.slabHeight);
  const dividerWidth = inches(calc.divider);
  const sideWidth = inches(type === 'Panel' ? calc.panelWidth : calc.sidelightWidth);
  const sideHeight = inches(type === 'Panel' ? calc.panelHeight : calc.sidelightHeight);
  const transomWidth = inches(calc.transomWidth);
  const transomHeight = inches(calc.transomHeight);
  if (!(width > 0 && doorHeight > 0 && dividerWidth > 0)) return null;

  const composition = parseGlassUnitConfiguration(line.config);
  if (!composition.ok) return null;
  const leftCount = composition.value.leftSidelightCount;
  const rightCount = composition.value.rightSidelightCount;
  const bodyY = topology.hasTransom ? transomHeight + dividerWidth : 0;
  const bodyHeight = Math.max(doorHeight, sideHeight || 0);
  const parts: GlassDiagramPart[] = [];
  let cursor = 0;
  for (let index = 1; index <= leftCount; index += 1) {
    parts.push({ id: `left-sidelight-${index}`, kind: type === 'Panel' ? 'panel' : 'glass', x: cursor, y: bodyY, width: sideWidth, height: sideHeight, label: sideWidth < 24 ? `L${leftCount > 1 ? index : ''}` : `L ${type}${leftCount > 1 ? ` ${index}` : ''}` });
    cursor += sideWidth;
    parts.push({ id: `left-divider-${index}`, kind: 'divider', x: cursor, y: bodyY, width: dividerWidth, height: bodyHeight });
    cursor += dividerWidth;
  }

  const rightAssemblyWidth = rightCount * (sideWidth + dividerWidth);
  const doorAssemblyWidth = width - cursor - rightAssemblyWidth;
  if (topology.doorCount === 2) {
    const mullionWidth = Math.max(0, doorAssemblyWidth - slabWidth * 2);
    const leafWidth = (doorAssemblyWidth - mullionWidth) / 2;
    parts.push({ id: 'left-door', kind: 'door', x: cursor, y: bodyY, width: leafWidth, height: doorHeight, label: 'Door' });
    cursor += leafWidth;
    if (mullionWidth > 0) {
      parts.push({ id: 'door-mullion', kind: 'mullion', x: cursor, y: bodyY, width: mullionWidth, height: doorHeight });
      cursor += mullionWidth;
    }
    parts.push({ id: 'right-door', kind: 'door', x: cursor, y: bodyY, width: leafWidth, height: doorHeight, label: 'Door' });
    cursor += leafWidth;
  } else {
    parts.push({ id: 'door', kind: 'door', x: cursor, y: bodyY, width: doorAssemblyWidth, height: doorHeight, label: 'Door' });
    cursor += doorAssemblyWidth;
  }

  for (let index = 1; index <= rightCount; index += 1) {
    parts.push({ id: `right-divider-${index}`, kind: 'divider', x: cursor, y: bodyY, width: dividerWidth, height: bodyHeight });
    cursor += dividerWidth;
    parts.push({ id: `right-sidelight-${index}`, kind: type === 'Panel' ? 'panel' : 'glass', x: cursor, y: bodyY, width: sideWidth, height: sideHeight, label: sideWidth < 24 ? `R${rightCount > 1 ? index : ''}` : `R ${type}${rightCount > 1 ? ` ${index}` : ''}` });
    cursor += sideWidth;
  }
  if (topology.hasTransom) {
    parts.push({ id: 'transom-divider', kind: 'transom-divider', x: 0, y: transomHeight, width, height: dividerWidth });
    parts.push({ id: 'transom', kind: 'glass', x: (width - transomWidth) / 2, y: 0, width: transomWidth, height: transomHeight, label: 'Transom' });
  }
  return { width, height: bodyY + bodyHeight, dividerWidth, parts };
}
