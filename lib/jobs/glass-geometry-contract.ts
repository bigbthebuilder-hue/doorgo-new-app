import type { DoorGoAccessLevel } from '../auth/access';
import { SHOP_DIMENSION_FORMAT_HELP, formatShopDimension, parseDimension, parseStoredShopDimension } from './dimension-contract';
import type {
  DoorLineInput,
  GlassCalculationStatus,
  GlassGeometryValues,
  GlassIssue,
  GlassOverrideApproval,
  GlassUnit,
  NativeDoorLine,
  PanelSidelight,
  SidelightType,
} from './job-intake-types';
import {
  isFrameGlassConfiguration,
  orderedGlassUnitComponents,
  parseGlassUnitConfiguration,
  type GlassUnitComposition,
} from './glass-unit-composition-contract';

export const GLASS_CONFIGS = ['SD', 'DS', 'SDS', 'SDDS', 'T/D', 'T/DD', 'T/SD', 'T/DS', 'T/SDS', 'T/SDDS'] as const;
export const FIBERGLASS_PANEL_WIDTHS = [11.75, 13.75] as const;
export type GlassConfiguration = string;
export type SidelightPosition = 'left' | 'right';
export type GlassConfigurationTopology = {
  config: GlassConfiguration;
  doorCount: 1 | 2;
  doorPosition: 'single' | 'double';
  sidelightPositions: SidelightPosition[];
  hasTransom: boolean;
};

function compositionTopology(config: string, composition: GlassUnitComposition): GlassConfigurationTopology {
  return {
    config,
    doorCount: composition.door === 'DD' ? 2 : 1,
    doorPosition: composition.door === 'DD' ? 'double' : 'single',
    sidelightPositions: [
      ...Array.from({ length: composition.leftSidelightCount }, () => 'left' as const),
      ...Array.from({ length: composition.rightSidelightCount }, () => 'right' as const),
    ],
    hasTransom: composition.hasTransom,
  };
}

export const DEFAULT_GLASS_TERMS = {
  CLR_SB60_K4SG: { label: 'Clear', shopText: 'Clear', vendorLine1: '{W} x {H} 3mcltmp/3mcltmp', vendorLine2: 'sb60 k4sg' },
  SAT_SB60_K4SG: { label: 'Satin Etch', shopText: 'Satin Etch', vendorLine1: '{W} x {H} 3msatmp/3mcltmp', vendorLine2: 'sb60 k4sg' },
} as const;

export type GlassGeometryResult = {
  status: GlassCalculationStatus;
  warnings: GlassIssue[];
  blockers: GlassIssue[];
  incompleteDetails: GlassIssue[];
  workorderDetail: string;
  glassUnits: GlassUnit[];
  panelSidelights: PanelSidelight[];
  glassCalc: GlassGeometryValues | null;
  vendorCopyText: string;
  override: GlassOverrideApproval | null;
};

const issue = (code: string, message: string): GlassIssue => ({ code, message });
const text = (value: unknown): string | null => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

export function isGlassConfiguration(value: unknown): value is GlassConfiguration {
  return isFrameGlassConfiguration(value);
}

export function glassConfigurationTopology(config: GlassConfiguration): GlassConfigurationTopology {
  const parsed = parseGlassUnitConfiguration(config);
  if (!parsed.ok || !isFrameGlassConfiguration(config)) throw new Error('Unsupported frame-glass configuration.');
  return compositionTopology(parsed.canonicalConfig, parsed.value);
}

export function normalizeSidelightType(value: unknown): SidelightType | null {
  if (value === 'Glass' || String(value ?? '').toLowerCase() === 'glass') return 'Glass';
  if (value === 'Panel' || String(value ?? '').toLowerCase() === 'panel') return 'Panel';
  return null;
}

function numericDimension(value: unknown): { ok: true; inches: number; formatted: string } | { ok: false; missing: boolean; message: string } {
  if (value === null || value === undefined || String(value).trim() === '') return { ok: false, missing: true, message: SHOP_DIMENSION_FORMAT_HELP };
  if (typeof value === 'number') {
    const rounded = Math.round(value * 16) / 16;
    if (value > 0 && Math.abs(value - rounded) < 1e-9) return { ok: true, inches: rounded, formatted: formatShopDimension(rounded) };
    return { ok: false, missing: false, message: `Dimension must be positive and use 1/16-inch precision. ${SHOP_DIMENSION_FORMAT_HELP}` };
  }
  const parsed = parseStoredShopDimension(value);
  return parsed.ok === true ? parsed : { ok: false, missing: parsed.code === 'required', message: parsed.message };
}

function slabFor(input: DoorLineInput): { ok: true; width: number; height: number; label: string } | { ok: false; message: string } {
  if (input.customSlab === 'WoodCustom' || input.customSlab === 'Yes') {
    const width = numericDimension(input.customSlabWidth);
    const height = numericDimension(input.customSlabHeight);
    if (!width.ok || !height.ok) return { ok: false, message: `Enter valid Custom Slab width and height. ${SHOP_DIMENSION_FORMAT_HELP}` };
    return { ok: true, width: width.inches, height: height.inches, label: `Custom Wood ${width.formatted} x ${height.formatted}` };
  }
  const width = parseDimension(input.width);
  const height = parseDimension(input.height);
  if (!width.ok || !height.ok) return { ok: false, message: 'Choose valid door slab dimensions.' };
  let actualWidth = width.inches;
  let actualHeight = height.inches;
  if (String(input.material ?? '').toLowerCase() === 'fiberglass') {
    actualWidth = width.inches === 36 ? 35.75 : width.inches === 42 ? 41.75 : width.inches - 0.25;
    actualHeight = height.inches === 80 ? 79 : height.inches === 96 ? 95 : height.inches - 1;
  }
  return { ok: true, width: actualWidth, height: actualHeight, label: `${text(input.material) ?? 'Fiberglass'} ${formatShopDimension(actualWidth)} x ${formatShopDimension(actualHeight)}` };
}

const ddCoreHeaderWidth = (slabWidth: number) => slabWidth * 2 + 13 / 16 + 0.25;

function panelHeaderWidth(slabWidth: number, panelWidth: number, sides: number, doubleCore: boolean): number {
  const sideAssembly = panelWidth + 1.5 + 0.125;
  return doubleCore ? ddCoreHeaderWidth(slabWidth) + sides * sideAssembly : slabWidth + sides * sideAssembly + 0.25;
}

function glassTerm(code: unknown) {
  const key = String(code ?? 'CLR_SB60_K4SG') as keyof typeof DEFAULT_GLASS_TERMS;
  return { code: key in DEFAULT_GLASS_TERMS ? key : 'CLR_SB60_K4SG', ...DEFAULT_GLASS_TERMS[key in DEFAULT_GLASS_TERMS ? key : 'CLR_SB60_K4SG'] };
}

export function generateVendorCopy(units: GlassUnit[]): string {
  return units.map((unit) => {
    const term = glassTerm(unit.termCode);
    let template: string = term.vendorLine1;
    if (unit.position.toLowerCase().includes('sidelight')) template = template.replace(/3mcltmp/g, '4mcltmp').replace(/3msatmp/g, '4msatmp');
    return `${unit.position}${unit.qty > 1 ? ` qty ${unit.qty}` : ''}:\n${template.replace('{W}', unit.width).replace('{H}', unit.height)}\n${term.vendorLine2}`;
  }).join('\n\n');
}

function incomplete(blockers: GlassIssue[]): GlassGeometryResult {
  return {
    status: 'Glass Detail Needed', warnings: [], blockers: [], incompleteDetails: blockers,
    workorderDetail: 'GLASS DETAIL NEEDED\nRequired glass measurements or selections are incomplete.',
    glassUnits: [], panelSidelights: [], glassCalc: null, vendorCopyText: '', override: null,
  };
}

function blocked(blockers: GlassIssue[]): GlassGeometryResult {
  return {
    status: 'Blocked', warnings: [], blockers, incompleteDetails: [],
    workorderDetail: `[!] BLOCKED\n${blockers.map((entry) => `- ${entry.message}`).join('\n')}`,
    glassUnits: [], panelSidelights: [], glassCalc: null, vendorCopyText: '', override: null,
  };
}

function overrideApproval(value: unknown): GlassOverrideApproval | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<GlassOverrideApproval>;
  if (!text(candidate.approvedLineId) || !candidate.calculatedValues || !candidate.acceptedValues || !text(candidate.reason) || !text(candidate.appliedByUserId) || !text(candidate.appliedAt)) return null;
  return structuredClone(candidate as GlassOverrideApproval);
}

export function calculateGlassGeometry(input: DoorLineInput): GlassGeometryResult {
  const config = text(input.config);
  if (!isGlassConfiguration(config)) return { status: 'Unsupported', warnings: [], blockers: [issue('unsupported_configuration', 'This glass configuration is unsupported.')], incompleteDetails: [], workorderDetail: '', glassUnits: [], panelSidelights: [], glassCalc: null, vendorCopyText: '', override: null };
  const parsedComposition = parseGlassUnitConfiguration(config);
  if ('message' in parsedComposition) return blocked([issue('unsupported_configuration', parsedComposition.message)]);
  const composition = parsedComposition.value;
  const topology = compositionTopology(parsedComposition.canonicalConfig, composition);
  const slab = slabFor(input);
  if (slab.ok === false) return blocked([issue('invalid_custom_slab', slab.message)]);
  const roWidth = numericDimension(input.roWidth);
  const roHeight = numericDimension(input.roHeight);
  const missing: GlassIssue[] = [];
  if (roWidth.ok === false && roWidth.missing) missing.push(issue('ro_width_required', 'Rough-opening width is required.'));
  if (topology.hasTransom && roHeight.ok === false && roHeight.missing) missing.push(issue('ro_height_required', 'Rough-opening height is required for a transom.'));
  const sidelightType = topology.sidelightPositions.length ? normalizeSidelightType(input.sidelightType) : null;
  if (topology.sidelightPositions.length && text(input.sidelightType) && !sidelightType) {
    return blocked([issue('conflicting_sidelight_state', 'Every sidelight in the unit must use one unit-level type: Glass or Panel. Mixed or malformed sidelight state is invalid.')]);
  }
  if (topology.sidelightPositions.length && !sidelightType) missing.push(issue('sidelight_type_required', 'Choose one unit-level sidelight type: Glass or Panel.'));
  if (sidelightType === 'Glass' && !text(input.sidelightGlass ?? input.glass)) missing.push(issue('sidelight_glass_required', 'Choose the sidelight glass.'));
  if (topology.hasTransom && !text(input.transomGlass ?? input.glass)) missing.push(issue('transom_glass_required', 'Choose the transom glass.'));
  const panelWidth = sidelightType === 'Panel' ? numericDimension(input.panelSidelightWidth) : null;
  if (panelWidth?.ok === false && panelWidth.missing) {
    const position = topology.sidelightPositions.length > 1 ? 'shared' : topology.sidelightPositions[0];
    missing.push(issue('panel_width_required', position === 'shared' ? 'Enter the shared sidelight panel width.' : `Enter the ${position} sidelight panel width.`));
  }
  if (missing.length) return incomplete(missing);
  const invalid: GlassIssue[] = [];
  if (roWidth.ok === false) invalid.push(issue('invalid_ro_width', roWidth.message));
  if (topology.hasTransom && roHeight.ok === false) invalid.push(issue('invalid_ro_height', roHeight.message));
  if (panelWidth?.ok === false) invalid.push(issue('invalid_panel_width', panelWidth.message));
  if (panelWidth?.ok && String(input.material ?? '').toLowerCase() !== 'wood' && !FIBERGLASS_PANEL_WIDTHS.includes(panelWidth.inches as 11.75 | 13.75)) {
    invalid.push(issue('unsupported_fiberglass_panel_width', 'Fiberglass sidelight panel width must be 11 3/4" or 13 3/4".'));
  }
  if (invalid.length || roWidth.ok === false || (topology.hasTransom && roHeight.ok === false)) return blocked(invalid);

  const roW = roWidth.inches;
  const roH = roHeight.ok ? roHeight.inches : null;
  const sides = topology.sidelightPositions.length;
  const panel = sidelightType === 'Panel' && sides > 0;
  const doubleCore = topology.doorCount === 2 && sides > 0;
  const divider = panel ? 1.5 : 2.25;
  const outswing = String(input.hand ?? '').includes('OUT');
  const swing = outswing ? 'outswing' : 'inswing';
  const warnings: GlassIssue[] = [];
  const blockers: GlassIssue[] = [];
  let jambLeg: number;
  let finalDoorHeight: number;
  let standardRoHeight: number | null = null;
  let cutDown = 0;
  const deduction = outswing ? 2 : 2.25;
  const fullHeightJambLeg = slab.height + deduction;
  if (topology.hasTransom) {
    jambLeg = fullHeightJambLeg;
    finalDoorHeight = slab.height;
  } else {
    standardRoHeight = slab.height + deduction + 0.5;
    jambLeg = roH === null ? fullHeightJambLeg : Math.min(fullHeightJambLeg, roH - 0.5);
    const requestedDoorHeight = jambLeg - deduction;
    const roRequestedDoorHeight = roH === null ? slab.height : roH - 0.5 - deduction;
    finalDoorHeight = Math.min(slab.height, requestedDoorHeight);
    cutDown = Math.max(0, slab.height - finalDoorHeight);
    if (roH !== null && roRequestedDoorHeight > slab.height + 0.001) warnings.push(issue('ro_taller_than_standard', 'RO is taller than the standard full-height unit; verify jamb/extension requirements.'));
    if (roH !== null && cutDown > 0.001) warnings.push(issue('door_cut_down', `Door will be cut down ${formatShopDimension(cutDown)}.`));
    if (roH !== null && cutDown > 2.5) warnings.push(issue('large_cut_down', 'Door cut-down is large. Confirm before cutting.'));
  }

  const parsedPanelWidth = panel && panelWidth?.ok ? panelWidth.inches : null;
  const headerWidth = panel && parsedPanelWidth !== null
    ? panelHeaderWidth(slab.width, parsedPanelWidth, sides, doubleCore)
    : sides > 0 ? roW - 2
      : topology.doorCount === 2 ? ddCoreHeaderWidth(slab.width)
        : config === 'T/D' ? slab.width + 0.25 : roW - 2;
  const minimumRoWidth = headerWidth + 2;
  if (!doubleCore && (topology.doorCount === 2 || config === 'T/D') && roW + 0.001 < minimumRoWidth) blockers.push(issue('ro_too_narrow', `RO width is too narrow. Minimum RO width is ${formatShopDimension(minimumRoWidth)}.`));
  if (panel && roW + 0.001 < minimumRoWidth) blockers.push(issue('panel_ro_too_narrow', `RO width is too narrow for the selected panel width. Minimum RO width is ${formatShopDimension(minimumRoWidth)}.`));

  let sidelightWidth: number | null = null;
  let sidelightHeight: number | null = null;
  if (sides && !panel) {
    sidelightWidth = doubleCore
      ? (headerWidth - ddCoreHeaderWidth(slab.width) - divider * 2 - 0.125 * 2) / 2
      : (roW - 2 - divider * sides - slab.width - 0.25 - 0.125 * sides) / sides;
    sidelightHeight = finalDoorHeight + 0.125;
    if (!(sidelightWidth > 0)) blockers.push(issue('nonpositive_sidelight_width', 'Sidelight width is zero or negative.'));
    if (!(sidelightHeight > 0)) blockers.push(issue('nonpositive_sidelight_height', 'Sidelight height is zero or negative.'));
  }

  let transomWidth: number | null = null;
  let transomHeight: number | null = null;
  if (topology.hasTransom) {
    transomWidth = panel || config === 'T/DD' || config === 'T/D' ? headerWidth - 0.125 : roW - 2.125;
    transomHeight = (roH as number) - slab.height - (config === 'T/D' ? (outswing ? 4.125 : 4.375) : (outswing ? 4.875 : 5.125));
    if (panel) transomHeight += 0.75;
    if (!(transomWidth > 0)) blockers.push(issue('nonpositive_transom_width', 'Transom width is zero or negative.'));
    if (!(transomHeight > 0)) blockers.push(issue('nonpositive_transom_height', 'RO height is too short; transom height would be zero or negative.'));
  }
  if (!(headerWidth > 0)) blockers.push(issue('nonpositive_header', 'Header length is zero or negative.'));
  if (!(jambLeg > 0)) blockers.push(issue('nonpositive_jamb_leg', 'Jamb leg length is zero or negative.'));
  if (blockers.length) return blocked(blockers);

  const sideComponents = orderedGlassUnitComponents(composition).filter((component) => component.kind === 'sidelight');
  const panels: PanelSidelight[] = panel && parsedPanelWidth !== null ? sideComponents.map((component) => ({
    position: `${component.side === 'left' ? 'Left' : 'Right'} sidelight ${component.index}`,
    material: String(input.material ?? '').toLowerCase() === 'wood' ? 'Wood' : 'Fiberglass',
    width: formatShopDimension(parsedPanelWidth), height: formatShopDimension(slab.height), qty: 1,
  })) : [];
  const units: GlassUnit[] = [];
  if (sides && !panel && sidelightWidth !== null && sidelightHeight !== null) {
    const term = glassTerm(input.sidelightGlass ?? input.glass);
    units.push(...sideComponents.map((component) => ({
      position: `${component.side === 'left' ? 'Left' : 'Right'} sidelight ${component.index}`,
      width: formatShopDimension(sidelightWidth), height: formatShopDimension(sidelightHeight),
      glassType: term.shopText, termCode: term.code, qty: 1,
    })));
  }
  if (topology.hasTransom && transomWidth !== null && transomHeight !== null) {
    const term = glassTerm(input.transomGlass ?? input.glass);
    units.push({ position: 'Transom', width: formatShopDimension(transomWidth), height: formatShopDimension(transomHeight), glassType: term.shopText, termCode: term.code, qty: 1 });
  }
  const calc: GlassGeometryValues = {
    config, swing, roWidth: formatShopDimension(roW), roHeight: roH === null ? '' : formatShopDimension(roH),
    slabWidth: formatShopDimension(slab.width), slabHeight: formatShopDimension(slab.height), slabLabel: slab.label,
    headerWidth: formatShopDimension(headerWidth), minimumRoWidth: formatShopDimension(minimumRoWidth), jambLeg: formatShopDimension(jambLeg),
    finalDoorHeight: formatShopDimension(finalDoorHeight), standardRoHeight: standardRoHeight === null ? '' : formatShopDimension(standardRoHeight), cutDown: formatShopDimension(cutDown),
    sidelightWidth: sidelightWidth === null ? '' : formatShopDimension(sidelightWidth), sidelightHeight: sidelightHeight === null ? '' : formatShopDimension(sidelightHeight),
    panelWidth: parsedPanelWidth === null ? '' : formatShopDimension(parsedPanelWidth), panelHeight: panel ? formatShopDimension(slab.height) : '',
    transomWidth: transomWidth === null ? '' : formatShopDimension(transomWidth), transomHeight: transomHeight === null ? '' : formatShopDimension(transomHeight),
    divider: formatShopDimension(divider), sidelightType, panelSidelights: panels,
  };
  const visibleWarnings = warnings.filter((entry) => entry.code !== 'door_cut_down');
  const detail = [
    `Jamb legs: ${formatShopDimension(jambLeg)}     ${topology.hasTransom ? 'Header/Sill/T-bar' : 'Header/Sill'}: ${formatShopDimension(headerWidth)}`,
    ...(cutDown > 0.001 ? [`Door cut to ${formatShopDimension(finalDoorHeight)}`] : []),
    ...(panels.length ? ['PANELS', ...panels.map((entry) => `${entry.position}: ${entry.material} ${entry.width} x ${entry.height}`)] : []),
    ...(units.length ? ['GLASS', ...units.map((entry) => `${entry.position}: ${entry.qty > 1 ? `${entry.qty} @ ` : ''}${entry.width} x ${entry.height} ${entry.glassType}`)] : []),
    ...(visibleWarnings.length ? ['WARNINGS', ...visibleWarnings.map((entry) => `- ${entry.message}`)] : []),
  ].join('\n');
  const suppliedOverride = overrideApproval(input.glassOverride);
  const overrideValid = suppliedOverride && warnings.length > 0;
  const status: GlassCalculationStatus = overrideValid ? 'Manual Override' : warnings.length ? 'Warning' : 'Complete';
  const overrideText = overrideValid ? `\nMANUAL OVERRIDE\nReason: ${suppliedOverride.reason}\nCalculated: ${JSON.stringify(suppliedOverride.calculatedValues)}\nAccepted: ${JSON.stringify(suppliedOverride.acceptedValues)}` : '';
  return { status, warnings, blockers: [], incompleteDetails: [], workorderDetail: detail + overrideText, glassUnits: units, panelSidelights: panels, glassCalc: calc, vendorCopyText: generateVendorCopy(units), override: overrideValid ? suppliedOverride : null };
}

export function applyManualGeometryOverride(input: {
  line: DoorLineInput;
  accessLevel: DoorGoAccessLevel;
  acceptedValues: GlassGeometryValues;
  reason: string;
  actorUserId: string;
  actorDisplayName?: string | null;
  appliedAt: string;
}): GlassOverrideApproval {
  if (input.accessLevel !== 'use') throw new Error('Jobs = USE is required to apply a manual geometry override.');
  const calculated = calculateGlassGeometry({ ...input.line, glassOverride: null });
  if (calculated.status !== 'Warning' || calculated.blockers.length || !calculated.glassCalc) throw new Error('Manual override is available only for a fully measured reviewable warning with no hard blocker.');
  const reason = input.reason.trim();
  if (!reason) throw new Error('A manual geometry override reason is required.');
  if (!Object.keys(input.acceptedValues).length) throw new Error('Accepted manual geometry values are required.');
  const approvedLineId = text(input.line.lineId);
  if (!approvedLineId) throw new Error('Save or assign the stable line identity before applying an override.');
  return { approvedLineId, calculatedValues: calculated.glassCalc, acceptedValues: structuredClone(input.acceptedValues), reason, appliedByUserId: input.actorUserId, appliedByDisplayName: input.actorDisplayName?.trim() || null, appliedAt: input.appliedAt };
}

export function removeManualGeometryOverride(accessLevel: DoorGoAccessLevel): null {
  if (accessLevel !== 'use') throw new Error('Jobs = USE is required to remove a manual geometry override.');
  return null;
}

const GEOMETRY_FIELDS = ['config', 'width', 'height', 'customSlab', 'customSlabWidth', 'customSlabHeight', 'hand', 'roWidth', 'roHeight', 'material', 'sidelightType', 'sidelightGlass', 'transomGlass', 'panelSidelightWidth', 'sidelightMeasurementLeft', 'sidelightMeasurementRight'] as const;

export function geometryChanged(previous: DoorLineInput, next: DoorLineInput): boolean {
  return GEOMETRY_FIELDS.some((field) => JSON.stringify(previous[field] ?? null) !== JSON.stringify(next[field] ?? null));
}

export function retainCompatibleGlassFields(previous: DoorLineInput, nextConfig: string, nextType: SidelightType | null): DoorLineInput {
  const next: DoorLineInput = { ...structuredClone(previous), config: nextConfig, sidelightType: nextType };
  const previousConfig = String(previous.config ?? '');
  if ((previousConfig === 'SD' && nextConfig === 'DS') || (previousConfig === 'DS' && nextConfig === 'SD') || (previousConfig === 'T/SD' && nextConfig === 'T/DS') || (previousConfig === 'T/DS' && nextConfig === 'T/SD')) {
    next.sidelightMeasurementLeft = null;
    next.sidelightMeasurementRight = null;
  }
  if (normalizeSidelightType(previous.sidelightType) !== nextType) {
    next.glassCalc = null; next.glassOverride = null; next.glassWarnings = []; next.glassBlockers = [];
    next.glassUnits = []; next.panelSidelights = []; next.vendorCopyText = null; next.glassWorkorderDetail = null;
    if (nextType === 'Panel') next.sidelightGlass = null;
  }
  if (!isGlassConfiguration(nextConfig)) {
    for (const field of ['glass', 'roWidth', 'roHeight', 'sidelightGlass', 'transomGlass', 'sidelightMeasurementLeft', 'sidelightMeasurementRight', 'panelSidelightWidth', 'glassWorkorderDetail', 'vendorCopyText'] as const) next[field] = null;
    next.sidelightType = null; next.glassCalcStatus = 'Not Needed'; next.glassWarnings = []; next.glassBlockers = [];
    next.glassOverride = null; next.glassUnits = []; next.glassCalc = null; next.panelSidelights = [];
  } else {
    next.glassCalc = null; next.glassOverride = null; next.glassWarnings = []; next.glassBlockers = [];
    next.glassUnits = []; next.panelSidelights = []; next.vendorCopyText = null; next.glassWorkorderDetail = null; next.glassCalcStatus = 'Glass Detail Needed';
  }
  return next;
}

export function isGlassLineProductionReady(line: DoorLineInput): boolean {
  const requiredDoorFields = text(line.mode) === 'Exterior' && text(line.config) && text(line.width) && text(line.height) && Number(line.qty) > 0;
  return Boolean((line.lineStatus ?? 'Active') === 'Active' && requiredDoorFields && isGlassConfiguration(line.config) && (line.glassCalcStatus === 'Complete' || line.glassCalcStatus === 'Manual Override') && !(Array.isArray(line.glassBlockers) && line.glassBlockers.length));
}

export function glassLineNeedsAttention(line: DoorLineInput): GlassIssue[] {
  if ((line.lineStatus ?? 'Active') !== 'Active') return [];
  if (line.glassCalcStatus === 'Manual Override') return [];
  if (line.glassCalcStatus === 'Glass Detail Needed') return [issue('glass_detail_needed', 'Glass Detail Needed')];
  if (Array.isArray(line.glassBlockers) && line.glassBlockers.length) return structuredClone(line.glassBlockers);
  if (line.glassCalcStatus === 'Warning' && Array.isArray(line.glassWarnings)) return structuredClone(line.glassWarnings);
  return [];
}

export function normalizeGlassDomainFields(input: DoorLineInput): Pick<NativeDoorLine,
  'glassCalcStatus' | 'glassWorkorderDetail' | 'glassWarnings' | 'glassBlockers' | 'glassOverride' |
  'glassUnits' | 'glassCalc' | 'vendorCopyText' | 'sidelightType' | 'sidelightGlass' | 'transomGlass' |
  'sidelightMeasurementLeft' | 'sidelightMeasurementRight' | 'panelSidelightWidth' | 'panelSidelights'> {
  const result = calculateGlassGeometry(input);
  return {
    glassCalcStatus: result.status, glassWorkorderDetail: result.workorderDetail || null,
    glassWarnings: result.warnings, glassBlockers: result.blockers, glassOverride: result.override,
    glassUnits: result.glassUnits, glassCalc: result.glassCalc, vendorCopyText: result.vendorCopyText || null,
    sidelightType: normalizeSidelightType(input.sidelightType), sidelightGlass: text(input.sidelightGlass ?? input.glass),
    transomGlass: text(input.transomGlass ?? input.glass), sidelightMeasurementLeft: text(input.sidelightMeasurementLeft),
    sidelightMeasurementRight: text(input.sidelightMeasurementRight), panelSidelightWidth: text(result.glassCalc?.panelWidth ?? input.panelSidelightWidth), panelSidelights: result.panelSidelights,
  };
}
