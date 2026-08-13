import type { DoorLineInput, GlassUnit, PanelSidelight } from './job-intake-types';
import { parseGlassUnitConfiguration } from './glass-unit-composition-contract';

export type GlassResultRow = { key: string; label: string; value: string };

const sidelight = (position: string) => /sidelight/i.test(position);
const transom = (position: string) => /^transom$/i.test(position.trim());
const counts = (line: DoorLineInput) => {
  const parsed = parseGlassUnitConfiguration(line.config);
  return parsed.ok ? parsed.value : { leftSidelightCount: 0, rightSidelightCount: 0, hasTransom: false, door: 'D' as const };
};
const countText = (left: number, right: number) => `${left + right} total (${left} left / ${right} right)`;
const dimensions = (unit: GlassUnit | PanelSidelight) => `${unit.width} × ${unit.height}`;

export function glassResultRows(line: DoorLineInput, units: GlassUnit[], panels: PanelSidelight[]): GlassResultRow[] {
  const topology = counts(line);
  const sideGlass = units.filter((unit) => sidelight(unit.position));
  const sidePanels = panels.filter((panel) => sidelight(panel.position));
  const rows: GlassResultRow[] = [];
  const representative = sideGlass[0];
  if (representative) rows.push({
    key: 'sidelights', label: 'Sidelights',
    value: `${countText(topology.leftSidelightCount, topology.rightSidelightCount)} @ ${dimensions(representative)} — ${representative.glassType}`,
  });
  const representativePanel = sidePanels[0];
  if (representativePanel) rows.push({
    key: 'sidelights', label: 'Sidelights',
    value: `${countText(topology.leftSidelightCount, topology.rightSidelightCount)} @ ${dimensions(representativePanel)} — Panel${representativePanel.constructionNotes ? ` — ${representativePanel.constructionNotes}` : ''}`,
  });
  for (const unit of units.filter((candidate) => transom(candidate.position))) rows.push({ key: 'transom', label: 'Transom', value: `${dimensions(unit)} — ${unit.glassType}` });
  return rows;
}

export function aggregateVendorCopy(line: DoorLineInput, units: GlassUnit[], original: string): string {
  const topology = counts(line);
  const sides = units.filter((unit) => sidelight(unit.position));
  if (sides.length < 2) return original;
  const first = sides[0];
  const identical = sides.every((unit) => unit.width === first.width && unit.height === first.height && unit.glassType === first.glassType && unit.termCode === first.termCode);
  if (!identical) return original;
  const blocks = original.split(/\n\n+/);
  const sideBlocks = blocks.filter((block) => /sidelight/i.test(block));
  if (!sideBlocks.length) return original;
  const aggregate = `${sides.length} Sidelights (${topology.leftSidelightCount} left / ${topology.rightSidelightCount} right):\n${sideBlocks[0].split('\n').slice(1).join('\n')}`;
  return [aggregate, ...blocks.filter((block) => !/sidelight/i.test(block))].join('\n\n');
}
