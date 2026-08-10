import { formatShopDimension } from './dimension-contract';
import {
  automaticSidelightTBar,
  availableSidelightWidthForRo,
  calculateGlassGeometry,
  glassDoorCoreHeaderWidth,
  glassConfigurationTopology,
  isGlassConfiguration,
  normalizeSidelightType,
  normalizeGlassTypeCode,
  normalizeTBarSize,
  numericDimension,
  sidelightSpecificationType,
  slabFor,
  type GlassGeometryResult,
} from './glass-geometry-contract';
import { orderedGlassUnitComponents, parseGlassUnitConfiguration } from './glass-unit-composition-contract';
import type { DoorLineInput, GlassIssue, GlassTBarSize, SidelightSpecification } from './job-intake-types';

export type SidelightIdentity = { side: 'left' | 'right'; index: number };
export type GlassDimensionAuthority = { kind: 'roWidth' } | { kind: 'transomWidth' } | ({ kind: 'sidelightWidth' } & SidelightIdentity);
export type GlassCommittedEdit =
  | { kind: 'roWidth'; value: unknown }
  | { kind: 'transomWidth'; value: unknown }
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

export function canonicalSidelightSpecifications(input: DoorLineInput, positions = orderedPositions(input)): SidelightSpecification[] {
  const supplied = Array.isArray(input.sidelightSpecifications) ? input.sidelightSpecifications : [];
  const type = normalizeSidelightType(input.sidelightType) ?? 'Glass';
  return positions.map((position) => {
    const found = supplied.find((entry) => entry && samePosition(entry, position));
    const resolvedType = type;
    return {
      side: position.side,
      index: position.index,
      finishedWidth: found?.finishedWidth ?? (resolvedType === 'Panel' ? String(input.panelSidelightWidth ?? '').trim() || null : null),
      tBarSize: normalizeTBarSize(found?.tBarSize) ?? automaticSidelightTBar(resolvedType),
      glassTypeCode: resolvedType === 'Glass' ? normalizeGlassTypeCode(found?.glassTypeCode ?? input.sidelightGlass ?? input.glass) : null,
      customGlassDescription: found?.customGlassDescription?.trim() || null,
      panelSizeMode: resolvedType === 'Panel' ? found?.panelSizeMode ?? 'standard' : null,
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
  if (fixed === null) return unchanged();
  if (!positions.length) {
    if (edit.kind !== 'transomWidth' || !glassConfigurationTopology(String(input.config)).hasTransom) return unchanged();
    const width = numericDimension(edit.value);
    return { ...unchanged(), blockers: [issue(width.ok ? 'fixed_transom_width' : 'invalid_transom_width', width.ok ? 'This door-only transom width is fixed by the selected slab and door configuration.' : 'message' in width ? width.message : 'Enter a valid transom width.')] };
  }
  let specifications = canonicalSidelightSpecifications(input, positions);
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
      const commonWidth = rounded(targetTotal / widths.length);
      const adjusted = widths.map(() => commonWidth);
      if (adjusted.some((width) => width <= 0)) blockers.push(issue('nonpositive_sidelight_width', 'RO width would produce a zero or negative finished sidelight.'));
      else { specifications = applyWidths(specifications, adjusted); nextRo = ro.inches; notices.push(issue('ro_recalculated_sidelights', 'Sidelight widths were recalculated from the committed RO width.')); }
    }
  } else if (!blockers.length && authority.kind === 'transomWidth') {
    const transom = numericDimension(edit.kind === 'transomWidth' ? edit.value : input.glassCalc?.transomWidth);
    if (!transom.ok) blockers.push(issue('invalid_transom_width', 'message' in transom ? transom.message : 'Enter a valid transom width.'));
    else {
      const hasPanel = specifications.some((entry) => sidelightSpecificationType(entry, input.sidelightType) === 'Panel');
      const targetHeader = hasPanel ? transom.inches + 0.125 : null;
      nextRo = targetHeader === null ? rounded(transom.inches + 2.125) : rounded(targetHeader + 2);
      const targetTotal = targetHeader === null ? availableSidelightWidth(nextRo, fixed, specifications) : targetHeader - fixed.width - specifications.reduce((sum, entry) => sum + Number(entry.tBarSize) + 0.125, 0);
      const commonWidth = rounded(targetTotal / widths.length);
      const adjusted = widths.map(() => commonWidth);
      if (adjusted.some((width) => width <= 0)) blockers.push(issue('nonpositive_sidelight_width', 'Transom width would produce a zero or negative finished sidelight.'));
      else { specifications = applyWidths(specifications, adjusted); notices.push(issue('transom_recalculated_ro', 'RO and sidelight widths were recalculated from the committed transom width.')); }
    }
  } else if (!blockers.length) {
    const sideAuthority = authority as Extract<GlassDimensionAuthority, { kind: 'sidelightWidth' }>;
    const target = specifications.findIndex((entry) => samePosition(entry, sideAuthority));
    const dimension = numericDimension(edit.kind === 'sidelightWidth' && samePosition(edit, sideAuthority) ? edit.value : specifications[target]?.finishedWidth);
    if (target < 0) blockers.push(issue('invalid_sidelight_width', 'The committed sidelight position is not part of this configuration.'));
    else if (!dimension.ok) blockers.push(issue('invalid_sidelight_width', 'message' in dimension ? dimension.message : 'Enter a valid sidelight width.'));
    else {
      widths.fill(dimension.inches);
      specifications = applyWidths(specifications, widths);
      nextRo = rounded(fixed.width + specifications.reduce((sum, entry) => sum + dimension.inches + Number(entry.tBarSize) + 0.125, 0) + 2);
      notices.push(issue('sidelight_recalculated_ro', 'Recommended RO and dependent frame geometry were recalculated from the committed sidelight width.'));
    }
  }

  if (blockers.length || nextRo === null) return { ...unchanged(), blockers };
  const sourcePatch = { roWidth: formatShopDimension(nextRo), sidelightSpecifications: specifications };
  const calculatedGeometry = calculateGlassGeometry({ ...input, ...sourcePatch });
  return { sourcePatch, calculatedGeometry, blockers: calculatedGeometry.blockers, warnings: calculatedGeometry.warnings, informationalNotices: notices };
}
