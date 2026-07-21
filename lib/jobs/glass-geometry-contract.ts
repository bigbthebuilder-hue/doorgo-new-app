import type { DoorGoAccessLevel } from '../auth/access';
import { DIMENSION_FORMAT_HELP, formatDimension, parseDimension } from './dimension-contract';
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

export const GLASS_CONFIGS = ['SD', 'DS', 'SDS', 'SDDS', 'T/D', 'T/DD', 'T/SD', 'T/DS', 'T/SDS', 'T/SDDS'] as const;
export type GlassConfiguration = (typeof GLASS_CONFIGS)[number];
export type SidelightPosition = 'left' | 'right';
export type GlassConfigurationTopology = {
  config: GlassConfiguration;
  doorCount: 1 | 2;
  doorPosition: 'single' | 'double';
  sidelightPositions: SidelightPosition[];
  hasTransom: boolean;
};

const TOPOLOGY: Record<GlassConfiguration, GlassConfigurationTopology> = {
  SD: { config: 'SD', doorCount: 1, doorPosition: 'single', sidelightPositions: ['left'], hasTransom: false },
  DS: { config: 'DS', doorCount: 1, doorPosition: 'single', sidelightPositions: ['right'], hasTransom: false },
  SDS: { config: 'SDS', doorCount: 1, doorPosition: 'single', sidelightPositions: ['left', 'right'], hasTransom: false },
  SDDS: { config: 'SDDS', doorCount: 2, doorPosition: 'double', sidelightPositions: ['left', 'right'], hasTransom: false },
  'T/D': { config: 'T/D', doorCount: 1, doorPosition: 'single', sidelightPositions: [], hasTransom: true },
  'T/DD': { config: 'T/DD', doorCount: 2, doorPosition: 'double', sidelightPositions: [], hasTransom: true },
  'T/SD': { config: 'T/SD', doorCount: 1, doorPosition: 'single', sidelightPositions: ['left'], hasTransom: true },
  'T/DS': { config: 'T/DS', doorCount: 1, doorPosition: 'single', sidelightPositions: ['right'], hasTransom: true },
  'T/SDS': { config: 'T/SDS', doorCount: 1, doorPosition: 'single', sidelightPositions: ['left', 'right'], hasTransom: true },
  'T/SDDS': { config: 'T/SDDS', doorCount: 2, doorPosition: 'double', sidelightPositions: ['left', 'right'], hasTransom: true },
};

export const DEFAULT_GLASS_TERMS = {
  CLR_SB60_K4SG: { label: 'Clear', shopText: 'Clear', vendorLine1: '{W} x {H} 3mcltmp/3mcltmp', vendorLine2: 'sb60 k4sg' },
  SAT_SB60_K4SG: { label: 'Satin Etch', shopText: 'Satin Etch', vendorLine1: '{W} x {H} 3msatmp/3mcltmp', vendorLine2: 'sb60 k4sg' },
} as const;

export type GlassGeometryResult = {
  status: GlassCalculationStatus;
  warnings: GlassIssue[];
  blockers: GlassIssue[];
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
  return (GLASS_CONFIGS as readonly string[]).includes(String(value ?? '').trim());
}

export function glassConfigurationTopology(config: GlassConfiguration): GlassConfigurationTopology {
  return structuredClone(TOPOLOGY[config]);
}

export function normalizeSidelightType(value: unknown): SidelightType | null {
  if (value === 'Glass' || String(value ?? '').toLowerCase() === 'glass') return 'Glass';
  if (value === 'Panel' || String(value ?? '').toLowerCase() === 'panel') return 'Panel';
  return null;
}

function numericDimension(value: unknown): { ok: true; inches: number; formatted: string } | { ok: false; missing: boolean; message: string } {
  if (value === null || value === undefined || String(value).trim() === '') return { ok: false, missing: true, message: DIMENSION_FORMAT_HELP };
  if (typeof value === 'number') {
    const rounded = Math.round(value * 16) / 16;
    if (value > 0 && Math.abs(value - rounded) < 1e-9) return { ok: true, inches: rounded, formatted: formatDimension(rounded) };
    return { ok: false, missing: false, message: `Dimension must be positive and use 1/16-inch precision. ${DIMENSION_FORMAT_HELP}` };
  }
  const parsed = parseDimension(value);
  return parsed.ok === true ? parsed : { ok: false, missing: parsed.code === 'required', message: parsed.message };
}

function slabFor(input: DoorLineInput): { ok: true; width: number; height: number; label: string } | { ok: false; message: string } {
  if (input.customSlab === 'WoodCustom' || input.customSlab === 'Yes') {
    const width = numericDimension(input.customSlabWidth);
    const height = numericDimension(input.customSlabHeight);
    if (!width.ok || !height.ok) return { ok: false, message: `Enter valid Custom Slab width and height. ${DIMENSION_FORMAT_HELP}` };
    return { ok: true, width: width.inches, height: height.inches, label: `Custom Wood ${width.formatted} x ${height.formatted}` };
  }
  const width = numericDimension(input.width);
  const height = numericDimension(input.height);
  if (!width.ok || !height.ok) return { ok: false, message: 'Choose valid door slab dimensions.' };
  let actualWidth = width.inches;
  let actualHeight = height.inches;
  if (String(input.material ?? '').toLowerCase() === 'fiberglass') {
    actualWidth = width.inches === 36 ? 35.75 : width.inches === 42 ? 41.75 : width.inches - 0.25;
    actualHeight = height.inches === 80 ? 79 : height.inches === 96 ? 95 : height.inches - 1;
  }
  return { ok: true, width: actualWidth, height: actualHeight, label: `${text(input.material) ?? 'Fiberglass'} ${width.formatted} x ${height.formatted}` };
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
    status: 'Glass Detail Needed', warnings: [], blockers,
    workorderDetail: 'GLASS DETAIL NEEDED\nRequired glass measurements or selections are incomplete.',
    glassUnits: [], panelSidelights: [], glassCalc: null, vendorCopyText: '', override: null,
  };
}

function blocked(blockers: GlassIssue[]): GlassGeometryResult {
  return {
    status: 'Blocked', warnings: [], blockers,
    workorderDetail: `[!] BLOCKED\n${blockers.map((entry) => `- ${entry.message}`).join('\n')}`,
    glassUnits: [], panelSidelights: [], glassCalc: null, vendorCopyText: '', override: null,
  };
}

function overrideApproval(value: unknown): GlassOverrideApproval | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<GlassOverrideApproval>;
  if (!candidate.calculatedValues || !candidate.acceptedValues || !text(candidate.reason) || !text(candidate.appliedByUserId) || !text(candidate.appliedAt)) return null;
  return structuredClone(candidate as GlassOverrideApproval);
}

export function calculateGlassGeometry(input: DoorLineInput): GlassGeometryResult {
  const config = text(input.config);
  if (!isGlassConfiguration(config)) return { status: 'Unsupported', warnings: [], blockers: [issue('unsupported_configuration', 'This glass configuration is unsupported.')], workorderDetail: '', glassUnits: [], panelSidelights: [], glassCalc: null, vendorCopyText: '', override: null };
  const topology = TOPOLOGY[config];
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
  if (panelWidth?.ok === false && panelWidth.missing) missing.push(issue('panel_width_required', 'Enter the shared sidelight panel width.'));
  if (missing.length) return incomplete(missing);
  const invalid: GlassIssue[] = [];
  if (roWidth.ok === false) invalid.push(issue('invalid_ro_width', roWidth.message));
  if (topology.hasTransom && roHeight.ok === false) invalid.push(issue('invalid_ro_height', roHeight.message));
  if (panelWidth?.ok === false) invalid.push(issue('invalid_panel_width', panelWidth.message));
  if (invalid.length || roWidth.ok === false || (topology.hasTransom && roHeight.ok === false)) return blocked(invalid);

  const roW = roWidth.inches;
  const roH = roHeight.ok ? roHeight.inches : null;
  const sides = topology.sidelightPositions.length;
  const panel = sidelightType === 'Panel' && sides > 0;
  const doubleCore = config === 'SDDS' || config === 'T/SDDS';
  const divider = panel ? 1.5 : 2.25;
  const outswing = String(input.hand ?? '').includes('OUT');
  const swing = outswing ? 'outswing' : 'inswing';
  const warnings: GlassIssue[] = [];
  const blockers: GlassIssue[] = [];
  let jambLeg: number;
  let finalDoorHeight: number;
  let standardRoHeight: number | null = null;
  let cutDown = 0;
  if (topology.hasTransom) {
    jambLeg = (roH as number) - 0.5;
    finalDoorHeight = slab.height;
  } else {
    const deduction = outswing ? 2 : 2.25;
    standardRoHeight = slab.height + deduction + 0.5;
    jambLeg = roH === null ? slab.height + deduction : roH - 0.5;
    const requestedDoorHeight = jambLeg - deduction;
    finalDoorHeight = Math.min(slab.height, requestedDoorHeight);
    cutDown = Math.max(0, slab.height - finalDoorHeight);
    if (roH !== null && requestedDoorHeight > slab.height + 0.001) warnings.push(issue('ro_taller_than_standard', 'RO is taller than the standard full-height unit; verify jamb/extension requirements.'));
    if (roH !== null && cutDown > 0.001) warnings.push(issue('door_cut_down', `Door will be cut down ${formatDimension(cutDown)}.`));
    if (roH !== null && cutDown > 2.5) warnings.push(issue('large_cut_down', 'Door cut-down is large. Confirm before cutting.'));
  }

  const parsedPanelWidth = panel && panelWidth?.ok ? panelWidth.inches : null;
  const headerWidth = panel && parsedPanelWidth !== null
    ? panelHeaderWidth(slab.width, parsedPanelWidth, sides, doubleCore)
    : doubleCore ? roW - 2
      : topology.doorCount === 2 ? ddCoreHeaderWidth(slab.width)
        : config === 'T/D' ? slab.width + 0.25 : roW - 2;
  const minimumRoWidth = headerWidth + 2;
  if (!doubleCore && (topology.doorCount === 2 || config === 'T/D') && roW + 0.001 < minimumRoWidth) blockers.push(issue('ro_too_narrow', `RO width is too narrow. Minimum RO width is ${formatDimension(minimumRoWidth)}.`));
  if (panel && roW + 0.001 < minimumRoWidth) blockers.push(issue('panel_ro_too_narrow', `RO width is too narrow for the selected panel width. Minimum RO width is ${formatDimension(minimumRoWidth)}.`));

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

  const panels: PanelSidelight[] = panel && parsedPanelWidth !== null ? [{ position: sides === 2 ? 'Each sidelight panel' : `${topology.sidelightPositions[0]} sidelight panel`, material: String(input.material ?? '').toLowerCase() === 'wood' ? 'Wood' : 'Fiberglass', width: formatDimension(parsedPanelWidth), height: formatDimension(slab.height), qty: sides }] : [];
  const units: GlassUnit[] = [];
  if (sides && !panel && sidelightWidth !== null && sidelightHeight !== null) {
    const term = glassTerm(input.sidelightGlass ?? input.glass);
    units.push({ position: sides === 2 ? 'Sidelights' : `${topology.sidelightPositions[0]} sidelight`, width: formatDimension(sidelightWidth), height: formatDimension(sidelightHeight), glassType: term.shopText, termCode: term.code, qty: sides });
  }
  if (topology.hasTransom && transomWidth !== null && transomHeight !== null) {
    const term = glassTerm(input.transomGlass ?? input.glass);
    units.push({ position: 'Transom', width: formatDimension(transomWidth), height: formatDimension(transomHeight), glassType: term.shopText, termCode: term.code, qty: 1 });
  }
  const calc: GlassGeometryValues = {
    config, swing, roWidth: formatDimension(roW), roHeight: roH === null ? '' : formatDimension(roH),
    slabWidth: formatDimension(slab.width), slabHeight: formatDimension(slab.height), slabLabel: slab.label,
    headerWidth: formatDimension(headerWidth), minimumRoWidth: formatDimension(minimumRoWidth), jambLeg: formatDimension(jambLeg),
    finalDoorHeight: formatDimension(finalDoorHeight), standardRoHeight: standardRoHeight === null ? '' : formatDimension(standardRoHeight), cutDown: formatDimension(cutDown),
    sidelightWidth: sidelightWidth === null ? '' : formatDimension(sidelightWidth), sidelightHeight: sidelightHeight === null ? '' : formatDimension(sidelightHeight),
    panelWidth: parsedPanelWidth === null ? '' : formatDimension(parsedPanelWidth), panelHeight: panel ? formatDimension(slab.height) : '',
    transomWidth: transomWidth === null ? '' : formatDimension(transomWidth), transomHeight: transomHeight === null ? '' : formatDimension(transomHeight),
    divider: formatDimension(divider), sidelightType, panelSidelights: panels,
  };
  const visibleWarnings = warnings.filter((entry) => entry.code !== 'door_cut_down');
  const detail = [
    `Jamb legs: ${formatDimension(jambLeg)}     ${topology.hasTransom ? 'Header/Sill/T-bar' : 'Header/Sill'}: ${formatDimension(headerWidth)}`,
    ...(cutDown > 0.001 ? [`Door cut to ${formatDimension(finalDoorHeight)}`] : []),
    ...(panels.length ? ['PANELS', ...panels.map((entry) => `${entry.position}: ${entry.material} ${entry.width} x ${entry.height}`)] : []),
    ...(units.length ? ['GLASS', ...units.map((entry) => `${entry.position}: ${entry.qty > 1 ? `${entry.qty} @ ` : ''}${entry.width} x ${entry.height} ${entry.glassType}`)] : []),
    ...(visibleWarnings.length ? ['WARNINGS', ...visibleWarnings.map((entry) => `- ${entry.message}`)] : []),
  ].join('\n');
  const suppliedOverride = overrideApproval(input.glassOverride);
  const overrideValid = suppliedOverride && warnings.length > 0;
  const status: GlassCalculationStatus = overrideValid ? 'Manual Override' : warnings.length ? 'Warning' : 'Complete';
  const overrideText = overrideValid ? `\nMANUAL OVERRIDE\nReason: ${suppliedOverride.reason}\nCalculated: ${JSON.stringify(suppliedOverride.calculatedValues)}\nAccepted: ${JSON.stringify(suppliedOverride.acceptedValues)}` : '';
  return { status, warnings, blockers: [], workorderDetail: detail + overrideText, glassUnits: units, panelSidelights: panels, glassCalc: calc, vendorCopyText: generateVendorCopy(units), override: overrideValid ? suppliedOverride : null };
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
  return { calculatedValues: calculated.glassCalc, acceptedValues: structuredClone(input.acceptedValues), reason, appliedByUserId: input.actorUserId, appliedByDisplayName: input.actorDisplayName?.trim() || null, appliedAt: input.appliedAt };
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
    sidelightMeasurementRight: text(input.sidelightMeasurementRight), panelSidelightWidth: text(input.panelSidelightWidth), panelSidelights: result.panelSidelights,
  };
}
