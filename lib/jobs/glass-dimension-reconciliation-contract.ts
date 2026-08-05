import { formatShopDimension } from './dimension-contract';
import {
  automaticSidelightTBar,
  availableSidelightWidthForRo,
  calculateGlassGeometry,
  glassDoorCoreHeaderWidth,
  glassConfigurationTopology,
  isGlassConfiguration,
  normalizeSidelightType,
  normalizeTBarSize,
  numericDimension,
  slabFor,
  type GlassGeometryResult,
} from './glass-geometry-contract';
import { orderedGlassUnitComponents, parseGlassUnitConfiguration } from './glass-unit-composition-contract';
import type { DoorLineInput, GlassIssue, GlassTBarSize, SidelightSpecification } from './job-intake-types';

export type SidelightIdentity = { side: 'left' | 'right'; index: number };
export type GlassDimensionAuthority = { kind: 'roWidth' } | ({ kind: 'sidelightWidth' } & SidelightIdentity);
export type GlassCommittedEdit =
  | { kind: 'roWidth'; value: unknown }
  | ({ kind: 'sidelightWidth'; value: unknown } & SidelightIdentity)
  | ({ kind: 'sidelightTBar'; value: unknown } & SidelightIdentity);

export type GlassDimensionReconciliation = {
  sourcePatch: Pick<DoorLineInput, 'roWidth' | 'sidelightSpecifications'>;
  calculatedGeometry: GlassGeometryResult;
  blockers: GlassIssue[];
  warnings: GlassIssue[];
  informationalNotices: GlassIssue[];
};

const issue = (code: string, message: string): GlassIssue => ({ code, message });
const rounded = (value: number) => Math.round(value * 16) / 16;
const samePosition = (left: SidelightIdentity, right: SidelightIdentity) => left.side === right.side && left.index === right.index;

function orderedPositions(input: DoorLineInput): SidelightIdentity[] {
  const parsed = parseGlassUnitConfiguration(input.config);
  return parsed.ok
    ? orderedGlassUnitComponents(parsed.value).filter((entry): entry is { kind: 'sidelight'; side: 'left' | 'right'; index: number } => entry.kind === 'sidelight')
      .map(({ side, index }) => ({ side, index }))
    : [];
}

function canonicalSpecifications(input: DoorLineInput, positions: SidelightIdentity[]): SidelightSpecification[] {
  const supplied = Array.isArray(input.sidelightSpecifications) ? input.sidelightSpecifications : [];
  const type = normalizeSidelightType(input.sidelightType) ?? 'Glass';
  return positions.map((position) => {
    const found = supplied.find((entry) => entry && samePosition(entry, position));
    return {
      side: position.side,
      index: position.index,
      finishedWidth: found?.finishedWidth ?? null,
      tBarSize: normalizeTBarSize(found?.tBarSize) ?? automaticSidelightTBar(type),
      glassTypeCode: found?.glassTypeCode ?? null,
      customGlassDescription: found?.customGlassDescription?.trim() || null,
      panelSizeMode: found?.panelSizeMode ?? null,
      panelConstructionNotes: found?.panelConstructionNotes?.trim() || null,
    };
  });
}

function fixedHeaderWidth(input: DoorLineInput): { width: number; slabWidth: number; doorCount: 1 | 2 } | null {
  const slab = slabFor(input);
  if (!slab.ok || !isGlassConfiguration(input.config)) return null;
  const doorCount = glassConfigurationTopology(input.config).doorCount;
  return { width: glassDoorCoreHeaderWidth(slab.width, doorCount), slabWidth: slab.width, doorCount };
}

function availableSidelightWidth(roWidth: number, fixed: { slabWidth: number; doorCount: 1 | 2 }, specifications: SidelightSpecification[]): number {
  return availableSidelightWidthForRo(roWidth, fixed.slabWidth, fixed.doorCount, specifications.map((entry) => entry.tBarSize as GlassTBarSize));
}

function currentWidths(input: DoorLineInput, specifications: SidelightSpecification[], fixed: { slabWidth: number; doorCount: 1 | 2 }): number[] | null {
  const parsed = specifications.map((entry) => numericDimension(entry.finishedWidth));
  if (parsed.every((entry) => entry.ok)) return parsed.map((entry) => entry.ok ? entry.inches : 0);
  const legacyPanel = numericDimension(input.panelSidelightWidth);
  if (normalizeSidelightType(input.sidelightType) === 'Panel' && legacyPanel.ok) return specifications.map(() => legacyPanel.inches);
  const ro = numericDimension(input.roWidth);
  if (!ro.ok || !specifications.length) return null;
  const equal = rounded(availableSidelightWidth(ro.inches, fixed, specifications) / specifications.length);
  const widths = specifications.map(() => equal);
  widths[widths.length - 1] = rounded(availableSidelightWidth(ro.inches, fixed, specifications) - equal * (widths.length - 1));
  return widths;
}

function applyWidths(specifications: SidelightSpecification[], widths: number[]): SidelightSpecification[] {
  return specifications.map((entry, index) => ({ ...entry, finishedWidth: formatShopDimension(widths[index]) }));
}

export function reconcileGlassDimensionCommit(input: DoorLineInput, edit: GlassCommittedEdit, preferredAuthority?: GlassDimensionAuthority | null): GlassDimensionReconciliation {
  const unchanged = (): GlassDimensionReconciliation => {
    const calculatedGeometry = calculateGlassGeometry(input);
    return { sourcePatch: {}, calculatedGeometry, blockers: [], warnings: calculatedGeometry.warnings, informationalNotices: [] };
  };
  const positions = orderedPositions(input);
  const fixed = fixedHeaderWidth(input);
  if (!positions.length || fixed === null) return unchanged();
  let specifications = canonicalSpecifications(input, positions);
  const widths = currentWidths(input, specifications, fixed);
  if (!widths) return unchanged();
  const blockers: GlassIssue[] = [];
  const notices: GlassIssue[] = [];
  let nextRo: number | null = null;

  if (edit.kind === 'sidelightTBar') {
    const size = normalizeTBarSize(edit.value);
    const target = specifications.findIndex((entry) => samePosition(entry, edit));
    if (!size || target < 0) blockers.push(issue('invalid_t_bar', 'T-bar must be 1.5 or 2.25.'));
    else specifications[target] = { ...specifications[target], tBarSize: size };
  }

  const authority = edit.kind === 'sidelightTBar' ? preferredAuthority ?? { kind: 'roWidth' as const } : edit;
  if (!blockers.length && authority.kind === 'roWidth') {
    const ro = numericDimension(edit.kind === 'roWidth' ? edit.value : input.roWidth);
    if (!ro.ok) blockers.push(issue('invalid_ro_width', 'message' in ro ? ro.message : 'Enter a valid RO width.'));
    else {
      const targetTotal = availableSidelightWidth(ro.inches, fixed, specifications);
      const delta = rounded((targetTotal - widths.reduce((sum, width) => sum + width, 0)) / widths.length);
      const adjusted = widths.map((width) => rounded(width + delta));
      adjusted[adjusted.length - 1] = rounded(targetTotal - adjusted.slice(0, -1).reduce((sum, width) => sum + width, 0));
      if (adjusted.some((width) => width <= 0)) blockers.push(issue('nonpositive_sidelight_width', 'RO width would produce a zero or negative finished sidelight.'));
      else { specifications = applyWidths(specifications, adjusted); nextRo = ro.inches; notices.push(issue('ro_recalculated_sidelights', 'Sidelight widths were recalculated from the committed RO width.')); }
    }
  } else if (!blockers.length) {
    const sideAuthority = authority as Extract<GlassDimensionAuthority, { kind: 'sidelightWidth' }>;
    const target = specifications.findIndex((entry) => samePosition(entry, sideAuthority));
    const dimension = numericDimension(edit.kind === 'sidelightWidth' && samePosition(edit, sideAuthority) ? edit.value : specifications[target]?.finishedWidth);
    if (target < 0) blockers.push(issue('invalid_sidelight_width', 'The committed sidelight position is not part of this configuration.'));
    else if (!dimension.ok) blockers.push(issue('invalid_sidelight_width', 'message' in dimension ? dimension.message : 'Enter a valid sidelight width.'));
    else {
      widths[target] = dimension.inches;
      specifications = applyWidths(specifications, widths);
      nextRo = rounded(fixed.width + specifications.reduce((sum, entry, index) => sum + widths[index] + Number(entry.tBarSize) + 0.125, 0) + 2);
      notices.push(issue('sidelight_recalculated_ro', 'Recommended RO and dependent frame geometry were recalculated from the committed sidelight width.'));
    }
  }

  if (blockers.length || nextRo === null) return { ...unchanged(), blockers };
  const sourcePatch = { roWidth: formatShopDimension(nextRo), sidelightSpecifications: specifications };
  const calculatedGeometry = calculateGlassGeometry({ ...input, ...sourcePatch });
  return { sourcePatch, calculatedGeometry, blockers: calculatedGeometry.blockers, warnings: calculatedGeometry.warnings, informationalNotices: notices };
}
