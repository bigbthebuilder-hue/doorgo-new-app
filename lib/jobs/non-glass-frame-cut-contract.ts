import { PATIO_DOOR_PRESETS, resolvedDoubleDoorLeaves, validateDoubleDoorSizing } from './double-door-sizing-contract';
import { usesCustomRo, customRoHeaderTarget, resolveCustomRoHeight } from './custom-ro-contract';
import type { DoorLineInput } from './job-intake-types';
import { formatShopDimension, parseDimension, parseStoredShopDimension } from './dimension-contract';
import { doubleDoorCoreWidth, normalizeDoubleDoorAstragal } from './double-door-astragal-contract';

export type NonGlassFrameCutStatus = 'Complete' | 'Incomplete' | 'Blocked' | 'Not Applicable';
export type NonGlassFrameCutIssue = { code: string; field: string | null; message: string };
export type ShopDimension = { inches: number; display: string };

export type NonGlassFrameCutValues = {
  nominalWidth: string;
  nominalHeight: string;
  activeLeafWidth?: ShopDimension;
  inactiveLeafWidth?: ShopDimension;
  actualSlabWidth: ShopDimension;
  actualSlabHeight: ShopDimension;
  finalSlabWidth: ShopDimension;
  finalSlabHeight: ShopDimension;
  jambLeg: ShopDimension | null;
  headerWidth: ShopDimension | null;
  sillOrThresholdWidth: ShopDimension | null;
  frameWidth: ShopDimension | null;
  doubleDoorCoreWidth: ShopDimension | null;
  widthCutDown?: ShopDimension;
  requiredWidthReduction?: ShopDimension;
  widthReviewRequired?: boolean;
  targetHeaderWidth?: ShopDimension;
  cutDown: ShopDimension;
  finishedOpeningHeight: ShopDimension | null;
  finishedOpeningWidth: null;
  dividerWidth: null;
};

export type NonGlassFrameCutResult = {
  status: NonGlassFrameCutStatus;
  configuration: string;
  mode: string;
  values: NonGlassFrameCutValues | null;
  missingFields: string[];
  warnings: NonGlassFrameCutIssue[];
  blockers: NonGlassFrameCutIssue[];
  detailLines: string[];
};

const SUPPORTED = new Set(['Interior:D', 'Interior:DD', 'Exterior:D', 'Exterior:DD', 'Interior:B.P.']);

function issue(code: string, field: string | null, message: string): NonGlassFrameCutIssue {
  return { code, field, message };
}

function dimension(inches: number): ShopDimension {
  const normalized = Math.round(inches * 16) / 16;
  return { inches: normalized, display: formatShopDimension(normalized) };
}

function baseResult(line: Readonly<DoorLineInput>, status: NonGlassFrameCutStatus): NonGlassFrameCutResult {
  return {
    status, configuration: String(line.config ?? ''), mode: String(line.mode ?? ''), values: null,
    missingFields: [], warnings: [], blockers: [], detailLines: [],
  };
}

function parseNominal(value: unknown): number | null {
  const parsed = parseDimension(value);
  return parsed.ok ? parsed.inches : null;
}

function actualSlab(line: Readonly<DoorLineInput>):
  | { ok: true; width: number; height: number }
  | { ok: false; missing: string[]; blockers: NonGlassFrameCutIssue[] } {
  if (line.doubleDoorSizing?.kind === 'patio') {
    const preset = PATIO_DOOR_PRESETS[line.doubleDoorSizing.preset];
    return { ok: true, width: preset.activeWidth, height: preset.height };
  }
  const custom = line.customSlab === 'WoodCustom' || line.customSlab === 'Yes';
  if (custom) {
    const missing = [
      ...(!String(line.customSlabWidth ?? '').trim() ? ['customSlabWidth'] : []),
      ...(!String(line.customSlabHeight ?? '').trim() ? ['customSlabHeight'] : []),
    ];
    if (missing.length) return { ok: false, missing, blockers: [] };
    const width = parseStoredShopDimension(line.customSlabWidth);
    const height = parseStoredShopDimension(line.customSlabHeight);
    const blockers: NonGlassFrameCutIssue[] = [];
    if (!width.ok) blockers.push(issue('invalid_custom_slab_width', 'customSlabWidth', 'Custom slab width is invalid.'));
    if (!height.ok) blockers.push(issue('invalid_custom_slab_height', 'customSlabHeight', 'Custom slab height is invalid.'));
    if (blockers.length || !width.ok || !height.ok) return { ok: false, missing: [], blockers };
    return { ok: true, width: width.inches, height: height.inches };
  }

  const missing = [
    ...(!String(line.width ?? '').trim() ? ['width'] : []),
    ...(!String(line.height ?? '').trim() ? ['height'] : []),
  ];
  if (missing.length) return { ok: false, missing, blockers: [] };
  const nominalWidth = parseNominal(line.width);
  const nominalHeight = parseNominal(line.height);
  const blockers: NonGlassFrameCutIssue[] = [];
  if (!(nominalWidth && nominalWidth > 0)) blockers.push(issue('invalid_nominal_width', 'width', 'Selected nominal door width is invalid.'));
  if (!(nominalHeight && nominalHeight > 0)) blockers.push(issue('invalid_nominal_height', 'height', 'Selected nominal door height is invalid.'));
  if (blockers.length || nominalWidth === null || nominalHeight === null) return { ok: false, missing: [], blockers };

  if (line.mode === 'Exterior' && String(line.material ?? 'fiberglass').toLowerCase() === 'fiberglass') {
    const width = nominalWidth === 36 || nominalWidth === 42 ? nominalWidth - 0.25 : nominalWidth - 0.25;
    const height = nominalHeight === 80 ? 79 : nominalHeight === 96 ? 95 : nominalHeight - 1;
    return { ok: true, width, height };
  }
  return { ok: true, width: nominalWidth, height: nominalHeight };
}

function blocked(
  line: Readonly<DoorLineInput>, blockers: NonGlassFrameCutIssue[],
): NonGlassFrameCutResult {
  return { ...baseResult(line, 'Blocked'), blockers };
}

export function calculateNonGlassFrameCut(line: Readonly<DoorLineInput>): NonGlassFrameCutResult {
  const key = `${String(line.mode ?? '')}:${String(line.config ?? '')}`;
  const missing = [
    ...(!String(line.mode ?? '').trim() ? ['mode'] : []),
    ...(!String(line.config ?? '').trim() ? ['config'] : []),
  ];
  if (missing.length) return { ...baseResult(line, 'Incomplete'), missingFields: missing };
  if (line.config === 'PKT' || !SUPPORTED.has(key)) return baseResult(line, 'Not Applicable');

  const sizingError = validateDoubleDoorSizing(line);
  if (sizingError) return blocked(line, [issue('invalid_dd_sizing', 'doubleDoorSizing', sizingError)]);
  const slab = actualSlab(line);
  if (slab.ok === false) {
    if (slab.missing.length) return { ...baseResult(line, 'Incomplete'), missingFields: slab.missing };
    return blocked(line, slab.blockers);
  }

  const nominalWidth = String(line.width ?? '');
  const nominalHeight = String(line.height ?? '');
  if (line.config === 'B.P.') {
    const entered = String(line.roHeight ?? '').trim();
    let finishedOpeningHeight: number;
    let finalHeight: number;
    let cutDown: number;
    if (entered) {
      const parsed = parseStoredShopDimension(entered);
      if (!parsed.ok) return blocked(line, [issue('invalid_finished_opening_height', 'roHeight', 'B.P. Finished Opening height is invalid.')]);
      finishedOpeningHeight = parsed.inches;
      finalHeight = finishedOpeningHeight - 2.75;
      if (!(finalHeight > 0)) return blocked(line, [issue('nonpositive_finished_door_height', 'roHeight', 'B.P. Finished Opening height produces a nonpositive door height.')]);
      if (finalHeight > slab.height + 0.001) return blocked(line, [issue('finished_door_exceeds_slab', 'roHeight', 'B.P. Finished Opening height requires a door taller than the applicable slab.')]);
      cutDown = Math.max(0, slab.height - finalHeight);
    } else {
      finalHeight = slab.height;
      finishedOpeningHeight = finalHeight + 2.75;
      cutDown = 0;
    }
    const values: NonGlassFrameCutValues = {
      nominalWidth, nominalHeight,
      actualSlabWidth: dimension(slab.width), actualSlabHeight: dimension(slab.height),
      finalSlabWidth: dimension(slab.width), finalSlabHeight: dimension(finalHeight),
      jambLeg: null, headerWidth: null, sillOrThresholdWidth: null, frameWidth: null,
      doubleDoorCoreWidth: null, cutDown: dimension(cutDown),
      finishedOpeningHeight: dimension(finishedOpeningHeight), finishedOpeningWidth: null, dividerWidth: null,
    };
    return {
      ...baseResult(line, 'Complete'), values,
      detailLines: [`F.O. Height: ${values.finishedOpeningHeight?.display ?? ''}`, `Door height: ${values.finalSlabHeight.display}`],
    };
  }

  const isDouble = line.config === 'DD';
  const customRo = usesCustomRo(line);
  const leaves = resolvedDoubleDoorLeaves(line.doubleDoorSizing, slab.width);
  const dimensions: { roWidth: number | null; roHeight: number | null } = { roWidth: null, roHeight: null };
  if (customRo) {
    for (const field of ['roWidth', 'roHeight'] as const) {
      if (!String(line[field] ?? '').trim()) continue;
      const parsed = parseStoredShopDimension(line[field]);
      if (!parsed.ok) return blocked(line, [issue('invalid_rough_opening_dimension', field, 'Enter a valid RO dimension in inches.')]);
      dimensions[field] = parsed.inches;
    }
  }
  const interior = line.mode === 'Interior';
  const outswing = String(line.hand ?? '').includes('OUT');
  // Preserve existing Standard/Patio allowances; the locked Custom RO path
  // uses the supplied normal inswing/outswing shop totals.
  const deduction = !customRo && interior ? 1.875 : outswing ? 2 : 2.25;
  const height = resolveCustomRoHeight(slab.height, deduction, dimensions.roHeight);
  const jambLeg = height.jambLeg;
  const finalHeight = height.finalSlabHeight;
  const cutDown = height.cutDown;
  const nonAstragalAllowance = interior ? -0.5 : 5 / 16;
  const singleAllowance = interior ? 7 / 32 : 0.25;
  const normalHeader = isDouble
    ? doubleDoorCoreWidth(leaves, normalizeDoubleDoorAstragal(line.doubleDoorAstragal), nonAstragalAllowance)
    : slab.width + singleAllowance;
  const targetHeader = customRoHeaderTarget(normalHeader, dimensions.roWidth);
  const requiredReduction = Math.max(0, normalHeader - targetHeader);
  const widthReviewRequired = isDouble && requiredReduction > 2;
  const widthCut = widthReviewRequired ? 0 : requiredReduction;
  const finalLeaves: readonly [number, number] = [leaves[0], leaves[1] - widthCut];
  const finalWidth = isDouble ? leaves[0] : slab.width - widthCut;
  const doubleCore = isDouble
    ? doubleDoorCoreWidth(finalLeaves, normalizeDoubleDoorAstragal(line.doubleDoorAstragal), nonAstragalAllowance)
    : null;
  const header = doubleCore ?? finalWidth + singleAllowance;
  const blockers: NonGlassFrameCutIssue[] = [];
  if (!(jambLeg > 0)) blockers.push(issue('nonpositive_jamb_leg', 'roHeight', 'Jamb-leg length is zero or negative.'));
  if (!(finalHeight > 0)) blockers.push(issue('nonpositive_final_slab_height', 'roHeight', 'Final slab height is zero or negative.'));
  if (!(finalWidth > 0) || (isDouble && !widthReviewRequired && !(finalLeaves[1] > 0))) blockers.push(issue('nonpositive_final_slab_width', 'roWidth', 'RO width produces a nonpositive slab width.'));
  if (!(targetHeader > 0)) blockers.push(issue('nonpositive_target_header', 'roWidth', 'RO width is too small for a positive header.'));
  if (!(header > 0)) blockers.push(issue('nonpositive_header_width', 'width', 'Header width is zero or negative.'));
  if (blockers.length) return blocked(line, blockers);

  const values: NonGlassFrameCutValues = {
    nominalWidth, nominalHeight,
    actualSlabWidth: dimension(slab.width), actualSlabHeight: dimension(slab.height),
    finalSlabWidth: dimension(finalWidth), finalSlabHeight: dimension(finalHeight),
    ...(isDouble ? { activeLeafWidth: dimension(leaves[0]), inactiveLeafWidth: dimension(finalLeaves[1]), actualSlabWidth: dimension(leaves[0]), finalSlabWidth: dimension(leaves[0]) } : {}),
    jambLeg: dimension(jambLeg), headerWidth: widthReviewRequired ? null : dimension(header),
    sillOrThresholdWidth: interior || widthReviewRequired ? null : dimension(header), frameWidth: widthReviewRequired ? null : dimension(header),
    doubleDoorCoreWidth: doubleCore === null || widthReviewRequired ? null : dimension(doubleCore),
    ...(customRo ? { widthCutDown: dimension(widthCut), requiredWidthReduction: dimension(requiredReduction), widthReviewRequired, targetHeaderWidth: dimension(targetHeader) } : {}), cutDown: dimension(cutDown),
    finishedOpeningHeight: null, finishedOpeningWidth: null, dividerWidth: null,
  };
  const warnings = cutDown > 0
    ? [issue('door_cut_down', 'roHeight', `Door will be cut down ${values.cutDown.display}.`)]
    : [];
  if (widthReviewRequired) warnings.push(issue('special_dd_width', 'roWidth', `SPECIAL / REVIEW REQUIRED: DD needs an inactive-slab reduction of ${dimension(requiredReduction).display}, beyond the normal 2-inch limit. No width cut or header/sill cut is approved.`));
  else if (widthCut > 0) warnings.push(issue('door_width_cut', 'roWidth', isDouble
    ? `Cut inactive slab ${dimension(widthCut).display} from ASTRAGAL EDGE ONLY. Active slab and inactive hinge edge remain unchanged.`
    : `Slab width cut: ${dimension(widthCut).display}. VERIFY SIZE AVAILABILITY if choosing a smaller nominal door instead.`));
  const detailLines = [
    ...(customRo && isDouble ? [`${widthReviewRequired ? 'Widths before special review' : 'Final slabs'}: active ${dimension(finalLeaves[0]).display} x ${dimension(finalHeight).display}; inactive ${dimension(finalLeaves[1]).display} x ${dimension(finalHeight).display}`] : []),
    ...(customRo && !isDouble && (widthCut > 0 || cutDown > 0) ? [`Final slab: ${dimension(finalWidth).display} x ${dimension(finalHeight).display}`] : []),
    ...(isDouble && line.doubleDoorSizing && !customRo ? [
      ...(line.doubleDoorSizing.kind === 'patio' ? [`Patio Door Replacement / ${line.doubleDoorSizing.preset}'`] : []),
      `Active slab: ${dimension(leaves[0]).display} x ${dimension(finalHeight).display}; Inactive slab: ${dimension(leaves[1]).display} x ${dimension(finalHeight).display}`,
    ] : []),
    `Jamb legs: ${values.jambLeg?.display}`,
    ...(widthReviewRequired ? [`Target header/sill for review only: ${dimension(targetHeader).display}`] : [`${interior ? 'Header' : 'Header/Sill'}: ${values.headerWidth?.display}`]),
    ...(cutDown > 0 ? [`Door cut to ${values.finalSlabHeight.display}`] : []),
  ];
  return { ...baseResult(line, 'Complete'), values, warnings, detailLines };
}
