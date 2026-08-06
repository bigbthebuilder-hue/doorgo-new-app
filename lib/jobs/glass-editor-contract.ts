import { GLASS_CONFIGS, glassConfigurationTopology, isGlassConfiguration, normalizeSidelightType } from './glass-geometry-contract';
import type { DoorLineInput } from './job-intake-types';
import type { GlassCalculationStatus } from './job-intake-types';

export const EXTERIOR_GLASS_EDITOR_CONFIGS = [...GLASS_CONFIGS];

export type GlassEditorVisibility = {
  showGlassMeasure: boolean;
  showSidelightType: boolean;
  showPanelWidth: boolean;
  showSidelightGlass: boolean;
  showTransomGlass: boolean;
  requireRoWidth: boolean;
  requireRoHeight: boolean;
};

export function glassEditorVisibility(line: DoorLineInput): GlassEditorVisibility {
  if (line.mode !== 'Exterior' || !isGlassConfiguration(line.config)) return { showGlassMeasure: false, showSidelightType: false, showPanelWidth: false, showSidelightGlass: false, showTransomGlass: false, requireRoWidth: false, requireRoHeight: false };
  const topology = glassConfigurationTopology(line.config);
  const type = normalizeSidelightType(line.sidelightType);
  return {
    showGlassMeasure: true,
    showSidelightType: topology.sidelightPositions.length > 0,
    showPanelWidth: topology.sidelightPositions.length > 0 && type === 'Panel',
    showSidelightGlass: topology.sidelightPositions.length > 0 && type === 'Glass',
    showTransomGlass: topology.hasTransom,
    requireRoWidth: true,
    requireRoHeight: topology.hasTransom,
  };
}

export function diagramSemanticLayout(config: string): { left: string | null; center: 'single-door' | 'double-door'; right: string | null; transom: boolean } | null {
  if (!isGlassConfiguration(config)) return null;
  const topology = glassConfigurationTopology(config);
  return {
    left: topology.sidelightPositions.includes('left') ? 'sidelight' : null,
    center: topology.doorCount === 2 ? 'double-door' : 'single-door',
    right: topology.sidelightPositions.includes('right') ? 'sidelight' : null,
    transom: topology.hasTransom,
  };
}

export function calculationPresentation(previous: GlassCalculationStatus | undefined, result: GlassCalculationStatus): {
  displayStatus: GlassCalculationStatus | 'Incomplete';
  persistedStatus: GlassCalculationStatus;
} {
  return result === 'Glass Detail Needed'
    ? { displayStatus: 'Incomplete', persistedStatus: previous ?? 'Ready' }
    : { displayStatus: result, persistedStatus: result };
}

export function canCommitGlassCalculation(status: GlassCalculationStatus, explicitLeaveDetailNeeded: boolean): boolean {
  return status !== 'Glass Detail Needed' || explicitLeaveDetailNeeded;
}

const MATERIAL_GLASS_FIELDS = new Set([
  'config', 'width', 'height', 'customSlab', 'customSlabWidth', 'customSlabHeight', 'hand',
  'roWidth', 'roHeight', 'material', 'sidelightType', 'sidelightGlass', 'panelSidelightWidth',
  'transomGlass', 'sidelightSpecifications', 'transomTBarSize', 'transomGlassTypeCode',
  'transomCustomGlassDescription',
]);

export function nextGlassBuilderDraft(line: DoorLineInput, field: string, value: unknown): DoorLineInput {
  const next = { ...structuredClone(line), [field]: value };
  if (!MATERIAL_GLASS_FIELDS.has(field)) return next;
  return {
    ...next, glassCalcStatus: 'Ready', glassWorkorderDetail: null, glassWarnings: [],
    glassBlockers: [], glassOverride: null, glassUnits: [], panelSidelights: [],
    glassCalc: null, vendorCopyText: null,
  };
}
