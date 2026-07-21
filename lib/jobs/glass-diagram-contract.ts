import { parseStoredShopDimension } from './dimension-contract';
import { calculateGlassGeometry, glassConfigurationTopology, isGlassConfiguration, normalizeSidelightType } from './glass-geometry-contract';
import type { DoorLineInput } from './job-intake-types';

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
  const result = calculateGlassGeometry(line);
  if (!result.glassCalc) return null;
  const calc = result.glassCalc;
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

  const hasLeft = topology.sidelightPositions.includes('left');
  const hasRight = topology.sidelightPositions.includes('right');
  const bodyY = topology.hasTransom ? transomHeight + dividerWidth : 0;
  const bodyHeight = Math.max(doorHeight, sideHeight || 0);
  const parts: GlassDiagramPart[] = [];
  let cursor = 0;
  if (hasLeft) {
    parts.push({ id: 'left-sidelight', kind: type === 'Panel' ? 'panel' : 'glass', x: cursor, y: bodyY, width: sideWidth, height: sideHeight, label: sideWidth < 24 ? 'L' : `L ${type}` });
    cursor += sideWidth;
    parts.push({ id: 'left-divider', kind: 'divider', x: cursor, y: bodyY, width: dividerWidth, height: bodyHeight });
    cursor += dividerWidth;
  }

  const rightAssemblyWidth = hasRight ? sideWidth + dividerWidth : 0;
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

  if (hasRight) {
    parts.push({ id: 'right-divider', kind: 'divider', x: cursor, y: bodyY, width: dividerWidth, height: bodyHeight });
    cursor += dividerWidth;
    parts.push({ id: 'right-sidelight', kind: type === 'Panel' ? 'panel' : 'glass', x: cursor, y: bodyY, width: sideWidth, height: sideHeight, label: sideWidth < 24 ? 'R' : `R ${type}` });
  }
  if (topology.hasTransom) {
    parts.push({ id: 'transom-divider', kind: 'transom-divider', x: 0, y: transomHeight, width, height: dividerWidth });
    parts.push({ id: 'transom', kind: 'glass', x: (width - transomWidth) / 2, y: 0, width: transomWidth, height: transomHeight, label: 'Transom' });
  }
  return { width, height: bodyY + bodyHeight, dividerWidth, parts };
}
