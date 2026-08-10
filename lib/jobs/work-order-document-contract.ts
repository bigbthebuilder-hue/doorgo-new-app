import { parseStoredShopDimension } from './dimension-contract';
import { calculateNonGlassFrameCut, type NonGlassFrameCutResult } from './non-glass-frame-cut-contract';
import type { GlassGeometryValues, GlassIssue, NativeDoorLine, NativeJobAggregate, ResolvedSidelight, ResolvedTBar } from './job-intake-types';
import { normalizeHingeColor, normalizeHingeType, workOrderHingeDisplay } from './hinge-contract';
import { calculatePersistedGlassDiagramLayout, type GlassDiagramLayout } from './glass-diagram-contract';
import { withDerivedGlassGeometry } from './glass-geometry-contract';
import { isFrameGlassConfiguration } from './glass-unit-composition-contract';
import { unifiedJobIdentifier } from './unified-job-identifier';

export const WORK_ORDER_COLUMNS = ['Qty', 'Config', 'Size', 'Thick', 'Door Type', 'Drill', 'Hinge', 'Swing', 'Jamb', 'Sill', 'W/S', 'Notes/Glass'] as const;
export const FIRST_PAGE_WEIGHT_CAPACITY = 22;
export const CONTINUATION_PAGE_WEIGHT_CAPACITY = 26;

export type WorkOrderPresentationStatus = 'Complete' | 'Glass Detail Needed' | 'Warning' | 'Blocked' | 'Manual Override';
export type WorkOrderDetailKind = 'frame' | 'glass' | 'panel' | 'warning' | 'blocker' | 'detail-needed' | 'manual-override';

export type WorkOrderDetailRow = {
  kind: WorkOrderDetailKind;
  lines: string[];
  calculatedValues?: GlassGeometryValues;
  acceptedValues?: GlassGeometryValues;
  overrideReason?: string;
};

export type WorkOrderPrimaryRow = {
  lineId: string;
  lineIndex: number;
  status: WorkOrderPresentationStatus;
  cells: {
    quantity: string; configuration: string; size: string; thickness: string; doorType: string;
    drill: string; hinge: string; swing: string; jamb: string; sill: string;
    weatherstrip: string; notesGlass: string;
  };
};

export type WorkOrderRowGroup = {
  primaryRow: WorkOrderPrimaryRow;
  detailRows: WorkOrderDetailRow[];
  weightedUnits: number;
  diagram: GlassDiagramLayout | null;
};

export type WorkOrderHeader = {
  visibleIdentifier: string;
  customer: string;
  siteAddress: string;
  phone: string;
  email: string;
  salesperson: string;
  shopHours: string;
  shopHoursSource: string;
  fulfillmentType: string;
  fulfillmentDate: string;
  notes: string;
  generatedDate: string;
  shopDate: string;
  poNumbers: string[];
  poDisplay: string;
};

export type WorkOrderPage = {
  pageNumber: number;
  totalPages: number;
  kind: 'First' | 'Continuation';
  visibleIdentifier: string;
  header: WorkOrderHeader | null;
  continuationHeader: { customer: string; visibleIdentifier: string; label: 'Continued' } | null;
  rowGroups: WorkOrderRowGroup[];
  weightedUnitsUsed: number;
  footerText: string;
};

export type WorkOrderDocument = {
  internalCorrelation: { internalJobId: string; sourceAggregateRevision: number };
  visibleIdentifier: string;
  pdfFilename: string;
  generatedAt: string;
  generatedDate: string;
  columns: typeof WORK_ORDER_COLUMNS;
  header: WorkOrderHeader;
  rowGroups: WorkOrderRowGroup[];
  pages: WorkOrderPage[];
  validationIssues: WorkOrderValidationIssue[];
};

export type WorkOrderValidationIssue = {
  field: 'hingeColor' | 'hingeType';
  lineIndex: number | null;
  message: string;
};

export type WorkOrderGenerationInput = { generatedAt: string; generatedDate: string };

function text(value: unknown): string { return String(value ?? '').trim(); }

export function resolveWorkOrderIdentifier(job: Pick<NativeJobAggregate, 'bizTrackSalesOrder' | 'doorGoReference'> & Partial<Pick<NativeJobAggregate, 'legacyJobId'>>): string {
  try { return unifiedJobIdentifier(job).value; }
  catch { throw new Error('A saved visible job identifier is required to generate a work order.'); }
}

export function createWorkOrderPdfFilename(visibleIdentifier: string): string {
  const safe = text(visibleIdentifier)
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '_')
    .replace(/\.\.+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._\s]+|[._\s]+$/g, '');
  if (!safe) throw new Error('A safe visible job identifier is required for the work-order filename.');
  return `Work_Order_${safe}.pdf`;
}

export function formatWorkOrderPoNumbers(values: readonly unknown[]): { values: string[]; display: string } {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const po = text(value);
    if (!po) continue;
    if (!/^\d+$/.test(po)) throw new Error('PO numbers must contain digits only.');
    if (!seen.has(po)) { seen.add(po); normalized.push(po); }
  }
  normalized.sort((left, right) => left.length === right.length ? left.localeCompare(right) : left.length - right.length);
  if (!normalized.length) return { values: [], display: '' };
  const first = normalized[0];
  const root = first.length > 2 ? first.slice(0, -2) : '';
  const display = [first, ...normalized.slice(1).map((po) => (
    root && po.length === first.length && po.slice(0, -2) === root ? po.slice(-2) : po
  ))].join('/');
  return { values: normalized, display };
}

function canonicalStoredDimension(value: unknown): string {
  const parsed = parseStoredShopDimension(value);
  return parsed.ok ? parsed.formatted : text(value);
}

function isNoJamb(line: NativeDoorLine): boolean {
  return line.mode === 'Interior' && (line.config === 'PKT' || line.config === 'B.P.');
}

function prepDisplay(prep: string | null): string {
  const raw = text(prep);
  const value = raw.toUpperCase();
  if (value === 'STD') return 'Double drilled';
  if (value === 'MULTI') return 'Multipoint';
  if (value === 'SINGLE' || value === 'YES') return 'Single drilled';
  if (value === 'NO') return 'None';
  if (value === 'BOTH') return 'Both doors drilled';
  if (value === 'HALF') return 'Half drill for finger pulls';
  if (value === 'ROUND') return 'Round Weiser';
  return raw;
}

function jambDisplay(line: NativeDoorLine): string {
  if (isNoJamb(line)) return '';
  const type = text(line.jambType) || 'Primed';
  const width = text(line.jambWidth);
  if (!width) return type === 'Primed' ? '' : type;
  return type === 'Primed' ? width : `${width} ${type}`;
}

function sizeDisplay(line: NativeDoorLine): string {
  if ((line.customSlab === 'WoodCustom' || line.customSlab === 'Yes') && line.customSlabWidth && line.customSlabHeight) {
    return `${canonicalStoredDimension(line.customSlabWidth)} × ${canonicalStoredDimension(line.customSlabHeight)}`;
  }
  if (text(line.height) === `6'8"`) return text(line.width);
  return `${text(line.width)} × ${text(line.height)}`;
}

function issues(issuesToMap: readonly GlassIssue[]): string[] {
  return issuesToMap.map((entry) => text(entry.message)).filter(Boolean);
}

function presentationStatus(line: NativeDoorLine): WorkOrderPresentationStatus {
  if (line.glassCalcStatus === 'Glass Detail Needed') return 'Glass Detail Needed';
  if (line.glassCalcStatus === 'Blocked' || line.glassCalcStatus === 'Unsupported' || line.glassBlockers.length) return 'Blocked';
  if (line.glassCalcStatus === 'Manual Override' || line.glassOverride) return 'Manual Override';
  if (line.glassCalcStatus === 'Warning' || line.glassWarnings.length) return 'Warning';
  return 'Complete';
}

function nonGlassDetailRows(result: NonGlassFrameCutResult): WorkOrderDetailRow[] {
  if (result.status === 'Not Applicable') return [];
  if (result.status === 'Incomplete') return [{ kind: 'detail-needed', lines: result.missingFields.map((field) => `Missing ${field}.`) }];
  if (result.status === 'Blocked') return [{ kind: 'blocker', lines: result.blockers.map((entry) => entry.message) }];
  const rows: WorkOrderDetailRow[] = [];
  const productionLines = result.configuration === 'B.P.'
    ? [
      ...result.detailLines.filter((line) => line.startsWith('F.O. Height:')),
      ...(result.values && result.values.cutDown.inches > 0 ? [`Door cut to: ${result.values.finalSlabHeight.display}`] : []),
    ]
    : result.detailLines;
  if (productionLines.length) rows.push({ kind: 'frame', lines: [productionLines.join(' | ')] });
  if (result.warnings.length) rows.push({ kind: 'warning', lines: [result.warnings.map((entry) => entry.message).join(' | ')] });
  return rows;
}

function calculatedGlassProductionLine(line: NativeDoorLine): string {
  const calc = line.glassCalc ?? {};
  const parts: string[] = [];
  if (text(calc.jambLeg)) parts.push(`Jamb legs: ${text(calc.jambLeg)}`);
  if (text(calc.headerWidth)) parts.push(`${line.config.startsWith('T/') ? 'Header/Sill/T-bar' : 'Header/Sill'}: ${text(calc.headerWidth)}`);
  const sidelights = Array.isArray(calc.resolvedSidelights) ? calc.resolvedSidelights as ResolvedSidelight[] : [];
  const transomTBar = calc.transomTBar as ResolvedTBar | undefined;
  const unitTBar = transomTBar?.resolvedSize ?? sidelights[0]?.tBar.resolvedSize;
  if (unitTBar) parts.push(`Unit T-bar: ${unitTBar}`);
  const cutDown = canonicalStoredDimension(calc.cutDown);
  if (cutDown && cutDown !== '0"' && text(calc.finalDoorHeight)) parts.push(`Door cut to: ${text(calc.finalDoorHeight)}`);
  return parts.join(' | ');
}

function overrideProductionLine(line: NativeDoorLine): string {
  const override = line.glassOverride;
  if (!override) return '';
  const changes = Object.entries(override.acceptedValues).flatMap(([key, accepted]) => {
    const calculated = override.calculatedValues[key];
    if (!text(accepted) || text(accepted) === text(calculated)) return [];
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
    return [`${label}: ${text(calculated)} -> ${text(accepted)}`];
  });
  return [...changes, `Reason: ${override.reason}`].join(' | ');
}

function glassDetailRows(line: NativeDoorLine): WorkOrderDetailRow[] {
  const status = presentationStatus(line);
  const rows: WorkOrderDetailRow[] = [];
  if (status === 'Glass Detail Needed') {
    const known: string[] = [];
    if (line.roWidth || line.roHeight) known.push(`RO: ${[canonicalStoredDimension(line.roWidth), canonicalStoredDimension(line.roHeight)].filter(Boolean).join(' x ')}`);
    rows.push({ kind: 'detail-needed', lines: [known.join(' | ')] });
  } else if (status !== 'Blocked' && line.glassCalc) {
    const production = calculatedGlassProductionLine(line);
    if (production) rows.push({ kind: 'frame', lines: [production] });
  }
  if (status !== 'Blocked' && status !== 'Glass Detail Needed' && line.panelSidelights.length) {
    const grouped = new Map<string, { count: number; material: string; width: string; height: string; position: string }>();
    for (const panel of line.panelSidelights) {
      const width = canonicalStoredDimension(panel.width);
      const height = canonicalStoredDimension(panel.height);
      const key = `${panel.material}\u0000${width}\u0000${height}`;
      const existing = grouped.get(key);
      if (existing) existing.count += Number(panel.qty) || 1;
      else grouped.set(key, { count: Number(panel.qty) || 1, material: panel.material, width, height, position: panel.position });
    }
    rows.push({ kind: 'panel', lines: [...grouped.values()].map((panel) => panel.count > 1
      ? `${panel.count} sidelight panels @ ${panel.material} ${panel.width} × ${panel.height}`
      : `${panel.position}: ${panel.material} ${panel.width} × ${panel.height}`) });
  }
  if (status !== 'Blocked' && status !== 'Glass Detail Needed' && line.glassUnits.length) {
    const fixed = line.glassUnits.filter((unit) => !/sidelight/i.test(unit.position));
    const sides = line.glassUnits.filter((unit) => /sidelight/i.test(unit.position));
    const grouped = new Map<string, { count: number; width: string; height: string; glassType: string; position: string }>();
    for (const unit of sides) {
      const width = canonicalStoredDimension(unit.width);
      const height = canonicalStoredDimension(unit.height);
      const key = `${width}\u0000${height}\u0000${unit.glassType}`;
      const existing = grouped.get(key);
      if (existing) existing.count += Number(unit.qty) || 1;
      else grouped.set(key, { count: Number(unit.qty) || 1, width, height, glassType: unit.glassType, position: unit.position });
    }
    rows.push({ kind: 'glass', lines: [
      ...fixed.map((unit) => `${unit.position}: ${unit.qty > 1 ? `${unit.qty} @ ` : ''}${canonicalStoredDimension(unit.width)} × ${canonicalStoredDimension(unit.height)} ${unit.glassType}`.trim()),
      ...[...grouped.values()].map((unit) => unit.count > 1
        ? `${unit.count} sidelights @ ${unit.width} × ${unit.height} ${unit.glassType}`.trim()
        : `${unit.position}: ${unit.width} × ${unit.height} ${unit.glassType}`.trim()),
    ] });
  }
  const warningLines = issues(line.glassWarnings);
  if (warningLines.length) rows.push({ kind: 'warning', lines: [warningLines.join(' | ')] });
  const blockerLines = issues(line.glassBlockers);
  if (blockerLines.length) rows.push({ kind: 'blocker', lines: [blockerLines.join(' | ')] });
  if (line.glassOverride) rows.push({
    kind: 'manual-override', lines: [overrideProductionLine(line)],
    calculatedValues: line.glassOverride.calculatedValues,
    acceptedValues: line.glassOverride.acceptedValues,
    overrideReason: line.glassOverride.reason,
  });
  return rows;
}

export function formatWorkOrderNotesGlass(value: string): string {
  const normalized = text(value);
  return normalized
    .split(/\s*(?:\||·)\s*|\s+-\s+/)
    .map(text)
    .filter((part) => part && !/^Glass$/i.test(part))
    .join(' | ');
}

function notesGlass(line: NativeDoorLine, status: WorkOrderPresentationStatus): string {
  const values = text(line.notes).split(/\r?\n/).map(text).filter(Boolean);
  if (status === 'Glass Detail Needed') values.push('GLASS DETAIL NEEDED');
  else if (status === 'Blocked') values.push('RO / GLASS NEEDS REVIEW');
  else if (line.glassUnits.length && !values.some((value) => /glass/i.test(value))) values.push('Glass');
  if (line.roWidth && line.roHeight && line.config !== 'PKT' && line.config !== 'B.P.') values.push(`RO ${canonicalStoredDimension(line.roWidth)} × ${canonicalStoredDimension(line.roHeight)}`);
  return formatWorkOrderNotesGlass([...new Map(values.map((value) => [value.toLowerCase(), value])).values()].join(' | '));
}

function compactWorkOrderDetails(details: WorkOrderDetailRow[]): WorkOrderDetailRow[] {
  const production = details.filter((row) => row.kind === 'frame' || row.kind === 'glass' || row.kind === 'panel');
  const exceptions = details.filter((row) => row.kind !== 'frame' && row.kind !== 'glass' && row.kind !== 'panel');
  const compactProduction = production.length ? [{
    kind: 'frame' as const,
    lines: [production.flatMap((row) => row.lines).filter(Boolean).join(' | ')],
  }] : [];
  return [...compactProduction, ...exceptions].slice(0, 3);
}

export function createWorkOrderRowGroup(line: NativeDoorLine, hingeColor: string | null): WorkOrderRowGroup {
  const glassConfiguration = isFrameGlassConfiguration(line.config);
  const outputLine = glassConfiguration ? withDerivedGlassGeometry(line) : line;
  const nonGlassResult = glassConfiguration ? null : calculateNonGlassFrameCut(outputLine);
  const status = glassConfiguration
    ? presentationStatus(outputLine)
    : nonGlassResult?.status === 'Blocked' || nonGlassResult?.status === 'Incomplete'
      ? 'Blocked'
      : 'Complete';
  const details = compactWorkOrderDetails(glassConfiguration ? glassDetailRows(outputLine) : nonGlassDetailRows(nonGlassResult!));
  const detailLineCount = details.flatMap((row) => row.lines).filter(Boolean).length;
  return {
    primaryRow: {
      lineId: outputLine.lineId, lineIndex: outputLine.lineIndex, status,
      cells: {
        quantity: String(outputLine.qty), configuration: text(outputLine.config), size: sizeDisplay(outputLine),
        thickness: text(outputLine.doorThickness) || (outputLine.mode === 'Interior' ? '1-3/8' : '1-3/4'),
        doorType: text(outputLine.doorType), drill: prepDisplay(outputLine.prep), hinge: workOrderHingeDisplay({ ...outputLine, hingeColor }),
        swing: isNoJamb(outputLine) ? '' : text(outputLine.hand), jamb: jambDisplay(outputLine), sill: text(outputLine.sill),
        weatherstrip: text(outputLine.weatherstrip), notesGlass: notesGlass(outputLine, status),
      },
    },
    detailRows: details,
    weightedUnits: 1 + (detailLineCount ? Math.max(2, Math.ceil(detailLineCount / 3)) : 0),
    diagram: glassConfiguration && outputLine.includeDiagramOnWorkOrder !== false ? calculatePersistedGlassDiagramLayout(outputLine) : null,
  };
}

export function paginateWorkOrder(
  groups: readonly WorkOrderRowGroup[], header: WorkOrderHeader,
): WorkOrderPage[] {
  const buckets: WorkOrderRowGroup[][] = [];
  let current: WorkOrderRowGroup[] = [];
  let used = 0;
  for (const group of groups) {
    const limit = buckets.length === 0 ? FIRST_PAGE_WEIGHT_CAPACITY : CONTINUATION_PAGE_WEIGHT_CAPACITY;
    if (current.length && used + group.weightedUnits > limit) {
      buckets.push(current); current = []; used = 0;
    }
    current.push(group); used += group.weightedUnits;
  }
  if (current.length) buckets.push(current);
  if (!buckets.length) buckets.push([]);
  return buckets.map((rowGroups, index) => ({
    pageNumber: index + 1, totalPages: buckets.length, kind: index === 0 ? 'First' : 'Continuation',
    visibleIdentifier: header.visibleIdentifier, header: index === 0 ? header : null,
    continuationHeader: index === 0 ? null : { customer: header.customer, visibleIdentifier: header.visibleIdentifier, label: 'Continued' },
    rowGroups, weightedUnitsUsed: rowGroups.reduce((sum, group) => sum + group.weightedUnits, 0),
    footerText: `Sales Order / Job ID: ${header.visibleIdentifier} | Page ${index + 1} of ${buckets.length}`,
  }));
}

export function generateWorkOrderDocument(aggregate: NativeJobAggregate, input: WorkOrderGenerationInput): WorkOrderDocument {
  const generatedAt = new Date(input.generatedAt);
  if (Number.isNaN(generatedAt.getTime()) || !text(input.generatedDate)) throw new Error('Valid injected generation date and time values are required.');
  const visibleIdentifier = resolveWorkOrderIdentifier(aggregate);
  const po = formatWorkOrderPoNumbers(aggregate.poNumbers);
  const fulfillmentType = aggregate.deliveryDate ? 'Delivery' : aggregate.customerPickupDate ? 'Customer Pickup' : text(aggregate.fulfillmentPlan);
  const header: WorkOrderHeader = {
    visibleIdentifier, customer: text(aggregate.customer), siteAddress: text(aggregate.siteAddress),
    phone: text(aggregate.phone), email: text(aggregate.email), salesperson: text(aggregate.salesperson),
    shopHours: aggregate.shopHours === null ? '' : String(aggregate.shopHours), shopHoursSource: text(aggregate.shopHoursSource),
    fulfillmentType, fulfillmentDate: text(aggregate.deliveryDate ?? aggregate.customerPickupDate), notes: text(aggregate.notes),
    generatedDate: input.generatedDate, shopDate: text(aggregate.shopDate), poNumbers: po.values, poDisplay: po.display,
  };
  const activeLines = aggregate.lines.filter((line) => line.lineStatus === 'Active').slice().sort((left, right) => left.lineIndex - right.lineIndex);
  const hingeColor = normalizeHingeColor(aggregate.hingeColor);
  const validationIssues: WorkOrderValidationIssue[] = [];
  if (hingeColor.ok === false) validationIssues.push({ field: 'hingeColor', lineIndex: null, message: hingeColor.message });
  for (const line of activeLines) {
    const hingeType = normalizeHingeType(line.mode, line.config, line.hingeType);
    if (hingeType.ok === false) validationIssues.push({ field: 'hingeType', lineIndex: line.lineIndex, message: `Door line ${line.lineIndex}: ${hingeType.message}` });
  }
  const rowGroups = activeLines.map((line) => createWorkOrderRowGroup(line, hingeColor.ok ? hingeColor.value : null));
  return {
    internalCorrelation: { internalJobId: aggregate.internalJobId, sourceAggregateRevision: aggregate.revision },
    visibleIdentifier, pdfFilename: createWorkOrderPdfFilename(visibleIdentifier), generatedAt: generatedAt.toISOString(),
    generatedDate: input.generatedDate, columns: WORK_ORDER_COLUMNS, header, rowGroups,
    pages: paginateWorkOrder(rowGroups, header), validationIssues,
  };
}
