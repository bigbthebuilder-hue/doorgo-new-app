import type { NativeDoorLine } from './job-intake-types';
import { formatShopDimension, parseDimension, parseStoredShopDimension } from './dimension-contract';

export type NonGlassFrameCutStatus = 'Complete' | 'Incomplete' | 'Blocked' | 'Not Applicable';
export type NonGlassFrameCutIssue = { code: string; field: string | null; message: string };
export type ShopDimension = { inches: number; display: string };

export type NonGlassFrameCutValues = {
  nominalWidth: string;
  nominalHeight: string;
  actualSlabWidth: ShopDimension;
  actualSlabHeight: ShopDimension;
  finalSlabWidth: ShopDimension;
  finalSlabHeight: ShopDimension;
  jambLeg: ShopDimension | null;
  headerWidth: ShopDimension | null;
  sillOrThresholdWidth: ShopDimension | null;
  frameWidth: ShopDimension | null;
  doubleDoorCoreWidth: ShopDimension | null;
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

function baseResult(line: Readonly<NativeDoorLine>, status: NonGlassFrameCutStatus): NonGlassFrameCutResult {
  return {
    status, configuration: String(line.config ?? ''), mode: String(line.mode ?? ''), values: null,
    missingFields: [], warnings: [], blockers: [], detailLines: [],
  };
}

function parseNominal(value: unknown): number | null {
  const parsed = parseDimension(value);
  return parsed.ok ? parsed.inches : null;
}

function actualSlab(line: Readonly<NativeDoorLine>):
  | { ok: true; width: number; height: number }
  | { ok: false; missing: string[]; blockers: NonGlassFrameCutIssue[] } {
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
  line: Readonly<NativeDoorLine>, blockers: NonGlassFrameCutIssue[],
): NonGlassFrameCutResult {
  return { ...baseResult(line, 'Blocked'), blockers };
}

export function calculateNonGlassFrameCut(line: Readonly<NativeDoorLine>): NonGlassFrameCutResult {
  const key = `${String(line.mode ?? '')}:${String(line.config ?? '')}`;
  const missing = [
    ...(!String(line.mode ?? '').trim() ? ['mode'] : []),
    ...(!String(line.config ?? '').trim() ? ['config'] : []),
  ];
  if (missing.length) return { ...baseResult(line, 'Incomplete'), missingFields: missing };
  if (line.config === 'PKT' || !SUPPORTED.has(key)) return baseResult(line, 'Not Applicable');

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
  const roHeightText = String(line.roHeight ?? '').trim();
  let roHeight: number | null = null;
  if (roHeightText) {
    const parsed = parseStoredShopDimension(roHeightText);
    if (!parsed.ok) return blocked(line, [issue('invalid_rough_opening_height', 'roHeight', 'Rough Opening height is invalid.')]);
    roHeight = parsed.inches;
  }

  const interior = line.mode === 'Interior';
  const deduction = interior ? 1.875 : String(line.hand ?? '').includes('OUT') ? 2 : 2.25;
  const jambLeg = roHeight === null ? slab.height + deduction : roHeight - 0.5;
  const requestedHeight = jambLeg - deduction;
  const finalHeight = Math.min(slab.height, requestedHeight);
  const cutDown = Math.max(0, slab.height - finalHeight);
  const doubleCore = isDouble
    ? interior ? slab.width * 2 + 0.25 : slab.width * 2 + 13 / 16 + 0.25
    : null;
  const header = doubleCore ?? (interior ? slab.width + 7 / 32 : slab.width + 0.25);
  const blockers: NonGlassFrameCutIssue[] = [];
  if (!(jambLeg > 0)) blockers.push(issue('nonpositive_jamb_leg', 'roHeight', 'Jamb-leg length is zero or negative.'));
  if (!(finalHeight > 0)) blockers.push(issue('nonpositive_final_slab_height', 'roHeight', 'Final slab height is zero or negative.'));
  if (!(header > 0)) blockers.push(issue('nonpositive_header_width', 'width', 'Header width is zero or negative.'));
  if (blockers.length) return blocked(line, blockers);

  const values: NonGlassFrameCutValues = {
    nominalWidth, nominalHeight,
    actualSlabWidth: dimension(slab.width), actualSlabHeight: dimension(slab.height),
    finalSlabWidth: dimension(slab.width), finalSlabHeight: dimension(finalHeight),
    jambLeg: dimension(jambLeg), headerWidth: dimension(header),
    sillOrThresholdWidth: interior ? null : dimension(header), frameWidth: dimension(header),
    doubleDoorCoreWidth: doubleCore === null ? null : dimension(doubleCore), cutDown: dimension(cutDown),
    finishedOpeningHeight: null, finishedOpeningWidth: null, dividerWidth: null,
  };
  const warnings = cutDown > 0
    ? [issue('door_cut_down', 'roHeight', `Door will be cut down ${values.cutDown.display}.`)]
    : [];
  const detailLines = [
    `Jamb legs: ${values.jambLeg?.display}`,
    `${interior ? 'Header' : 'Header/Sill'}: ${values.headerWidth?.display}`,
    ...(cutDown > 0 ? [`Door cut to ${values.finalSlabHeight.display}`] : []),
  ];
  return { ...baseResult(line, 'Complete'), values, warnings, detailLines };
}
