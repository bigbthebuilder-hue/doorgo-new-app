import {
  JobIntakeFailure,
  type DoorLineInput,
  type DoorLineMode,
  type NativeDoorLine,
} from './job-intake-types';
import { SHOP_DIMENSION_FORMAT_HELP, parseStoredShopDimension } from './dimension-contract';
import { isGlassConfiguration, normalizeGlassDomainFields } from './glass-geometry-contract';
import { calculateNonGlassFrameCut } from './non-glass-frame-cut-contract';
import { normalizeHingeType } from './hinge-contract';
import { parseGlassUnitConfiguration } from './glass-unit-composition-contract';

export const INTERIOR_WIDTHS = [
  `1'6"`, `2'0"`, `2'2"`, `2'4"`, `2'6"`, `2'8"`, `2'10"`, `3'0"`,
  `1'2"`, `1'4"`, `1'8"`, `1'10"`, `3'6"`, `4'0"`,
] as const;
export const EXTERIOR_WIDTHS = [
  `2'0"`, `2'4"`, `2'6"`, `2'8"`, `2'10"`, `3'0"`, `3'6"`, `4'0"`,
] as const;
export const DOOR_HEIGHTS = [`6'8"`, `7'0"`, `8'0"`] as const;
export const J2A_CONFIGS = {
  Interior: ['D', 'DD', 'PKT', 'B.P.'],
  Exterior: ['D', 'DD'],
} as const;
export const J2B_CONFIGS = ['SD', 'DS', 'SDS', 'SDDS', 'T/D', 'T/DD', 'T/SD', 'T/DS', 'T/SDS', 'T/SDDS'] as const;
export const PKT_PREPS = ['Round Weiser', 'Reg Emtek', 'LRG Emtek'] as const;
export const CONFIRMED_JOB_LINE_MESSAGE = 'A Confirmed Job must keep at least one valid active door line. Return the job to Draft or add another valid line first.';

type CoreDoorLine = Omit<NativeDoorLine,
  'lineId' | 'lineIndex' | 'lineStatus' | 'createdAt' | 'updatedAt' |
  'createdByUserId' | 'updatedByUserId'
>;

export type DoorLineValidation =
  | { ok: true; value: CoreDoorLine }
  | { ok: false; message: string; fieldErrors: Record<string, string> };

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

export function parseDoorInches(value: unknown): number {
  let source = String(value ?? '').trim().replace(/inches|inch|in/gi, '').replace(/["″]/g, '');
  if (!source) return Number.NaN;
  let feet = 0;
  if (source.includes("'")) {
    const parts = source.split("'");
    if (parts.length !== 2 || !/^\d+$/.test(parts[0].trim())) return Number.NaN;
    feet = Number(parts[0].trim()) * 12;
    source = parts[1].trim();
  }
  const pieces = source.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  let inches = 0;
  for (const piece of pieces) {
    if (/^\d+\/\d+$/.test(piece)) {
      const [numerator, denominator] = piece.split('/').map(Number);
      if (!denominator) return Number.NaN;
      inches += numerator / denominator;
    } else if (/^\d+(?:\.\d+)?$/.test(piece)) {
      inches += Number(piece);
    } else {
      return Number.NaN;
    }
  }
  return feet + inches;
}

export function prepChoices(mode: DoorLineMode, config: string): readonly string[] {
  if (mode === 'Exterior') return ['STD', 'MULTI', 'SINGLE'];
  if (config === 'D') return ['YES', 'NO'];
  if (config === 'DD') return ['NO', 'BOTH'];
  if (config === 'PKT') return PKT_PREPS;
  if (config === 'B.P.') return ['NO', 'HALF'];
  return [];
}

export function prepAfterHeightChange(
  mode: DoorLineMode,
  config: string,
  currentPrep: unknown,
  nextHeight: unknown,
): string {
  const choices = prepChoices(mode, config);
  const current = String(currentPrep ?? '');
  if (mode === 'Exterior' && [`7'0"`, `8'0"`].includes(String(nextHeight))) return choices.includes('MULTI') ? 'MULTI' : (choices[0] ?? '');
  return choices.includes(current) ? current : (choices[0] ?? '');
}

export function defaultDoorLine(mode: DoorLineMode = 'Exterior'): DoorLineInput {
  return {
    mode,
    doorType: '',
    config: 'D',
    width: mode === 'Exterior' ? `3'0"` : `2'6"`,
    height: `6'8"`,
    customSlab: 'No', customSlabWidth: '', customSlabHeight: '',
    hand: 'LH', prep: mode === 'Exterior' ? 'STD' : 'YES',
    jambWidth: mode === 'Exterior' ? `6-9/16"` : `4-9/16"`,
    jambType: 'Primed', sill: mode === 'Exterior' ? 'STD' : '',
    weatherstrip: mode === 'Exterior' ? 'WHT' : '',
    hingeType: mode === 'Exterior' ? 'BB' : 'REG',
    notes: '', qty: 1, material: mode === 'Exterior' ? 'fiberglass' : 'wood',
    doorThickness: '', ripJamb: '', roWidth: '', roHeight: '',
    glass: '', glassCalcStatus: 'Ready', glassWorkorderDetail: '',
    glassWarnings: [], glassBlockers: [], glassOverride: null,
    glassUnits: [], glassCalc: null, vendorCopyText: '',
    sidelightType: 'Glass', sidelightGlass: '', transomGlass: '',
    sidelightMeasurementLeft: '', sidelightMeasurementRight: '',
    panelSidelightWidth: '', panelSidelights: [], sidelightSpecifications: [],
    transomTBarSize: null, transomGlassTypeCode: null, transomCustomGlassDescription: null,
    includeDiagramOnWorkOrder: false,
  };
}

export function normalizeDoorLineInput(input: DoorLineInput): DoorLineValidation {
  const mode = text(input.mode) as DoorLineMode | null;
  const submittedConfig = text(input.config);
  const parsedConfig = mode === 'Exterior' ? parseGlassUnitConfiguration(submittedConfig) : null;
  const config = parsedConfig?.ok ? parsedConfig.canonicalConfig : submittedConfig;
  const width = text(input.width);
  const height = text(input.height);
  const errors: Record<string, string> = {};

  if (mode !== 'Interior' && mode !== 'Exterior') errors.mode = 'Choose Interior or Exterior.';
  const supported = mode && config
    ? (J2A_CONFIGS[mode] as readonly string[]).includes(config) || (mode === 'Exterior' && isGlassConfiguration(config))
    : false;
  if (!config) errors.config = 'Choose a configuration.';
  else if (!supported) errors.config = 'That configuration is not available for the selected mode.';
  const allowedWidths = mode === 'Interior' ? INTERIOR_WIDTHS : EXTERIOR_WIDTHS;
  if (!width || !(allowedWidths as readonly string[]).includes(width)) errors.width = 'Choose a deployed width for this mode.';
  if (!height || !(DOOR_HEIGHTS as readonly string[]).includes(height)) errors.height = 'Choose a deployed height.';

  const quantity = Number(input.qty);
  if (!Number.isInteger(quantity) || quantity <= 0) errors.qty = 'Quantity must be a positive whole number.';

  const noJamb = mode === 'Interior' && (config === 'PKT' || config === 'B.P.');
  const material = mode === 'Interior' ? 'wood' : (text(input.material)?.toLowerCase() ?? 'fiberglass');
  if (mode === 'Exterior' && !['fiberglass', 'wood'].includes(material)) errors.material = 'Choose Fiberglass or Wood.';

  let customSlab = text(input.customSlab) ?? 'No';
  if (customSlab === 'Yes') customSlab = 'WoodCustom';
  if (noJamb) customSlab = 'No';
  if (!['No', 'RO', 'WoodCustom'].includes(customSlab)) errors.customSlab = 'Choose Standard, Custom RO / Cut Down, or Custom Wood Slab.';
  if (customSlab === 'WoodCustom') {
    if (material !== 'wood') errors.customSlab = 'Custom slab dimensions are available for Wood only.';
    if (!parseStoredShopDimension(input.customSlabWidth).ok) errors.customSlabWidth = `Enter a valid custom slab width. ${SHOP_DIMENSION_FORMAT_HELP}`;
    if (!parseStoredShopDimension(input.customSlabHeight).ok) errors.customSlabHeight = `Enter a valid custom slab height. ${SHOP_DIMENSION_FORMAT_HELP}`;
  }

  const allowedPreps = mode && config ? prepChoices(mode, config) : [];
  let prep = text(input.prep);
  if (prep === 'Round') prep = 'Round Weiser';
  if (mode && config && height) prep = prepAfterHeightChange(mode, config, prep, height);
  if (!prep || !allowedPreps.includes(prep)) errors.prep = 'Choose a deployed prep option.';

  const hand = noJamb ? null : text(input.hand);
  const handOptions = mode === 'Exterior' ? ['LH', 'RH', 'LHOUT', 'RHOUT'] : config === 'DD' ? [null, 'LH', 'RH'] : ['LH', 'RH'];
  if (!noJamb && !handOptions.includes(hand)) errors.hand = 'Choose a deployed handing option.';

  const jambWidth = noJamb ? null : text(input.jambWidth);
  const ripJamb = noJamb ? null : (String(input.ripJamb ?? '').trim().toLowerCase() === 'yes' ? 'Yes' : null);
  if (!noJamb && (!jambWidth || jambWidth === 'None')) errors.jambWidth = 'Choose or enter a jamb width.';
  if (!noJamb && (jambWidth === 'RIP' || (ripJamb === 'Yes' && !(parseDoorInches(jambWidth) > 0)))) {
    errors.jambWidth = 'Enter the completed RIP jamb size before saving.';
  }
  if (!noJamb && !text(input.jambType)) errors.jambType = 'Choose a jamb type.';
  const hingeType = normalizeHingeType(mode, config, input.hingeType);
  if (hingeType.ok === false) errors.hingeType = hingeType.message;

  let roHeight = text(input.roHeight);
  if (config === 'B.P.' && roHeight && height) {
    const finishedOpening = parseDoorInches(roHeight);
    const slabHeight = parseDoorInches(height);
    if (!Number.isFinite(finishedOpening)) errors.roHeight = 'Enter a valid Finished Opening height.';
    else if (finishedOpening - 2.75 >= slabHeight - 0.001) roHeight = null;
  }

  const glassDomain = mode === 'Exterior' && config && isGlassConfiguration(config)
    ? normalizeGlassDomainFields(input)
    : null;
  if (glassDomain?.glassCalcStatus === 'Blocked' || glassDomain?.glassCalcStatus === 'Unsupported') {
    errors.glass = glassDomain.glassBlockers.map((entry) => entry.message).join(' ');
  }

  if (Object.keys(errors).length) return { ok: false, message: 'Review the highlighted door-line fields.', fieldErrors: errors };

  return {
    ok: true,
    value: {
      mode: mode as DoorLineMode,
      doorType: text(input.doorType), config: config as string, width: width as string, height: height as string,
      customSlab, customSlabWidth: customSlab === 'WoodCustom' ? text(input.customSlabWidth) : null,
      customSlabHeight: customSlab === 'WoodCustom' ? text(input.customSlabHeight) : null,
      hand, prep, glass: null, jambWidth, ripJamb,
      jambType: noJamb ? null : text(input.jambType),
      sill: mode === 'Interior' ? null : text(input.sill),
      weatherstrip: mode === 'Interior' ? null : text(input.weatherstrip),
      hingeType: hingeType.ok ? hingeType.value : null, notes: text(input.notes), qty: quantity,
      roWidth: noJamb ? null : text(input.roWidth), roHeight: config === 'PKT' ? null : roHeight,
      material, doorThickness: text(input.doorThickness),
      includeDiagramOnWorkOrder: Boolean(mode === 'Exterior' && config && isGlassConfiguration(config) && input.includeDiagramOnWorkOrder !== false),
      ...(glassDomain ?? {
        glassCalcStatus: 'Ready' as const, glassWorkorderDetail: null, glassWarnings: [], glassBlockers: [],
        glassOverride: null, glassUnits: [], glassCalc: null, vendorCopyText: null, sidelightType: null,
        sidelightGlass: null, transomGlass: null, sidelightMeasurementLeft: null,
        sidelightMeasurementRight: null, panelSidelightWidth: null, panelSidelights: [], sidelightSpecifications: [],
        transomTBarSize: null, transomGlassTypeCode: null, transomCustomGlassDescription: null,
      }),
    },
  };
}

export function hasValidActiveDoorLine(lines: DoorLineInput[]): boolean {
  return lines.some((line) => (line.lineStatus ?? 'Active') === 'Active' && normalizeDoorLineInput(line).ok);
}

export function assertConfirmedJobActiveLineInvariant(lifecycleStage: unknown, lines: DoorLineInput[]): void {
  if (lifecycleStage === 'Confirmed Job' && !hasValidActiveDoorLine(lines)) {
    throw new JobIntakeFailure('validation_failed', CONFIRMED_JOB_LINE_MESSAGE, { lines: CONFIRMED_JOB_LINE_MESSAGE });
  }
}

export function isValidActiveDoorLine(line: DoorLineInput): boolean {
  return normalizeDoorLineInput(line).ok;
}

/** Shared J2 consumer for the authoritative non-glass frame/cut domain result. */
export function calculateJ2NonGlassFrameCut(line: NativeDoorLine) {
  return calculateNonGlassFrameCut(line);
}

export function calculateJ2AShopHours(lines: DoorLineInput[]): {
  shopHours: number | null;
  shopHoursSource: 'Estimated' | 'Estimate incomplete' | null;
  unknown: string[];
} {
  let minutes = 0;
  const unknown: string[] = [];
  const active = lines.filter((line) => (line.lineStatus ?? 'Active') === 'Active');
  active.forEach((line, index) => {
    const mode = String(line.mode ?? '').trim();
    const config = String(line.config ?? '').trim();
    const base: Record<string, Record<string, number>> = {
      Interior: { D: 15, DD: 30, PKT: 15, 'B.P.': 15 },
      Exterior: { D: 60, DD: 90, SD: 180, DS: 180, SDS: 240, SDDS: 270, 'T/D': 90, 'T/DD': 120, 'T/SD': 240, 'T/DS': 240, 'T/SDS': 300, 'T/SDDS': 330 },
    };
    const baseMinutes = base[mode]?.[config];
    if (!baseMinutes) {
      unknown.push(`Line ${index + 1}: ${mode || 'Unknown mode'} ${config || 'Unknown configuration'}`);
      return;
    }
    let unitMinutes = baseMinutes;
    if (String(line.prep ?? '').toUpperCase() === 'MULTI') unitMinutes += ['DD', 'SDDS', 'T/DD', 'T/SDDS'].includes(config) ? 90 : 45;
    if (line.customSlab === 'RO') unitMinutes += config === 'D' ? 30 : config === 'DD' ? 45 : 0;
    if (String(line.ripJamb ?? '').toLowerCase() === 'yes') unitMinutes += 15;
    minutes += unitMinutes * Math.max(1, Number(line.qty) || 1);
  });
  if (unknown.length) return { shopHours: null, shopHoursSource: 'Estimate incomplete', unknown };
  if (!active.length) return { shopHours: null, shopHoursSource: null, unknown: [] };
  return { shopHours: Math.round(minutes / 15) / 4, shopHoursSource: 'Estimated', unknown: [] };
}

const DEPLOYED_MERGE_FIELDS = [
  'mode', 'doorType', 'config', 'width', 'height', 'customSlab', 'customSlabWidth',
  'customSlabHeight', 'hand', 'prep', 'glass', 'jambWidth', 'ripJamb', 'jambType',
  'sill', 'weatherstrip', 'hingeType', 'notes', 'roWidth', 'roHeight', 'material',
  'doorThickness', 'glassCalcStatus', 'glassWorkorderDetail', 'glassWarnings',
  'vendorCopyText', 'sidelightType', 'sidelightGlass', 'transomGlass',
  'sidelightMeasurementLeft', 'sidelightMeasurementRight', 'panelSidelightWidth',
  'sidelightSpecifications', 'transomTBarSize', 'transomGlassTypeCode', 'transomCustomGlassDescription',
] as const;

export function doorLineEquivalenceKey(line: DoorLineInput): string {
  const comparable: Record<string, string> = {};
  for (const field of DEPLOYED_MERGE_FIELDS) comparable[field] = String(line[field] ?? '').trim();
  const parsedConfig = parseGlassUnitConfiguration(line.config);
  if (parsedConfig.ok) comparable.config = parsedConfig.canonicalConfig;
  return JSON.stringify({
    ...comparable,
    glassWarnings: JSON.stringify(line.glassWarnings ?? []),
    glassBlockers: JSON.stringify(line.glassBlockers ?? []),
    glassOverride: JSON.stringify(line.glassOverride ?? null),
    glassUnits: JSON.stringify(line.glassUnits ?? []),
    glassCalc: JSON.stringify(line.glassCalc ?? null),
    panelSidelights: JSON.stringify(line.panelSidelights ?? []),
  });
}

export function mergeEquivalentActiveLines(lines: NativeDoorLine[]): {
  lines: NativeDoorLine[];
  mergedCount: number;
} {
  const result = lines.map((line) => structuredClone(line));
  const keepers = new Map<string, NativeDoorLine>();
  let mergedCount = 0;
  for (const line of result.filter((item) => item.lineStatus === 'Active').sort((a, b) => a.lineIndex - b.lineIndex)) {
    const key = doorLineEquivalenceKey(line);
    const keeper = keepers.get(key);
    if (!keeper) keepers.set(key, line);
    else {
      keeper.qty += line.qty;
      keeper.includeDiagramOnWorkOrder = keeper.includeDiagramOnWorkOrder !== false || line.includeDiagramOnWorkOrder !== false;
      line.lineStatus = 'Merged';
      mergedCount += 1;
    }
  }
  return { lines: result, mergedCount };
}
