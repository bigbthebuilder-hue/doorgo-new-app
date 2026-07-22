import { parseStoredShopDimension } from './dimension-contract';
import { calculateNonGlassFrameCut, type NonGlassFrameCutResult } from './non-glass-frame-cut-contract';
import type { GlassGeometryValues, GlassIssue, NativeDoorLine, NativeJobAggregate } from './job-intake-types';

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
};

export type WorkOrderGenerationInput = { generatedAt: string; generatedDate: string };

function text(value: unknown): string { return String(value ?? '').trim(); }

export function resolveWorkOrderIdentifier(job: Pick<NativeJobAggregate, 'bizTrackSalesOrder' | 'doorGoReference'>): string {
  const identifier = text(job.bizTrackSalesOrder) || text(job.doorGoReference);
  if (!identifier) throw new Error('A saved visible job identifier is required to generate a work order.');
  return identifier;
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

function hingeDisplay(line: NativeDoorLine, jobColor: string | null): string {
  if (isNoJamb(line)) return '';
  const raw = text(line.hingeType).toUpperCase();
  const hinge = raw.includes('BOM') ? 'BOM' : /\bNRP\b/.test(raw) ? 'NRP' : /\bBB\b/.test(raw) ? 'BB' : 'REG';
  const color = text(jobColor).toUpperCase().replace(/\s*NRP\b/g, '').trim();
  const outswing = line.mode === 'Exterior' && text(line.hand).includes('OUT');
  if (hinge === 'BOM') return [hinge, color].filter(Boolean).join(' ');
  if (hinge === 'REG') return outswing ? 'SS' : color;
  return [hinge, outswing ? 'SS' : color].filter(Boolean).join(' ');
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
  if (result.detailLines.length) rows.push({ kind: 'frame', lines: result.detailLines });
  if (result.warnings.length) rows.push({ kind: 'warning', lines: result.warnings.map((entry) => entry.message) });
  return rows;
}

function glassDetailRows(line: NativeDoorLine): WorkOrderDetailRow[] {
  const status = presentationStatus(line);
  const rows: WorkOrderDetailRow[] = [];
  if (status === 'Glass Detail Needed') {
    const known = [`Configuration: ${line.config}`];
    if (line.roWidth) known.push(`RO Width: ${canonicalStoredDimension(line.roWidth)}`);
    if (line.roHeight) known.push(`RO Height: ${canonicalStoredDimension(line.roHeight)}`);
    rows.push({ kind: 'detail-needed', lines: ['GLASS DETAIL NEEDED', ...known] });
  } else if (status !== 'Blocked' && line.glassCalc) {
    const calculated = Object.entries(line.glassCalc)
      .filter(([, value]) => (typeof value === 'string' || typeof value === 'number') && text(value))
      .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1')}: ${String(value)}`);
    if (calculated.length) rows.push({ kind: 'frame', lines: calculated });
  }
  if (status !== 'Blocked' && status !== 'Glass Detail Needed' && line.panelSidelights.length) {
    rows.push({ kind: 'panel', lines: line.panelSidelights.map((panel) => `${panel.position}: ${panel.qty > 1 ? `${panel.qty} @ ` : ''}${panel.material} ${canonicalStoredDimension(panel.width)} × ${canonicalStoredDimension(panel.height)}`) });
  }
  if (status !== 'Blocked' && status !== 'Glass Detail Needed' && line.glassUnits.length) {
    rows.push({ kind: 'glass', lines: line.glassUnits.map((unit) => `${unit.position}: ${unit.qty > 1 ? `${unit.qty} @ ` : ''}${canonicalStoredDimension(unit.width)} × ${canonicalStoredDimension(unit.height)} ${unit.glassType}`.trim()) });
  }
  const warningLines = issues(line.glassWarnings);
  if (warningLines.length) rows.push({ kind: 'warning', lines: warningLines });
  const blockerLines = issues(line.glassBlockers);
  if (blockerLines.length) rows.push({ kind: 'blocker', lines: blockerLines });
  if (line.glassOverride) rows.push({
    kind: 'manual-override', lines: ['MANUAL OVERRIDE', `Reason: ${line.glassOverride.reason}`],
    calculatedValues: line.glassOverride.calculatedValues,
    acceptedValues: line.glassOverride.acceptedValues,
    overrideReason: line.glassOverride.reason,
  });
  return rows;
}

function notesGlass(line: NativeDoorLine, status: WorkOrderPresentationStatus): string {
  const values = text(line.notes).split(/\r?\n/).map(text).filter(Boolean);
  if (status === 'Glass Detail Needed') values.push('GLASS DETAIL NEEDED');
  else if (status === 'Blocked') values.push('RO / GLASS NEEDS REVIEW');
  else if (line.glassUnits.length && !values.some((value) => /glass/i.test(value))) values.push('Glass');
  if (line.roWidth && line.roHeight && line.config !== 'PKT' && line.config !== 'B.P.') values.push(`RO ${canonicalStoredDimension(line.roWidth)} × ${canonicalStoredDimension(line.roHeight)}`);
  return [...new Map(values.map((value) => [value.toLowerCase(), value])).values()].join(' | ');
}

export function createWorkOrderRowGroup(line: NativeDoorLine, hingeColor: string | null): WorkOrderRowGroup {
  const glassConfiguration = ['SD', 'DS', 'SDS', 'SDDS', 'T/D', 'T/DD', 'T/SD', 'T/DS', 'T/SDS', 'T/SDDS'].includes(line.config);
  const nonGlassResult = glassConfiguration ? null : calculateNonGlassFrameCut(line);
  const status = glassConfiguration
    ? presentationStatus(line)
    : nonGlassResult?.status === 'Blocked' || nonGlassResult?.status === 'Incomplete'
      ? 'Blocked'
      : 'Complete';
  const details = glassConfiguration ? glassDetailRows(line) : nonGlassDetailRows(nonGlassResult!);
  const detailLineCount = details.flatMap((row) => row.lines).filter(Boolean).length;
  return {
    primaryRow: {
      lineId: line.lineId, lineIndex: line.lineIndex, status,
      cells: {
        quantity: String(line.qty), configuration: text(line.config), size: sizeDisplay(line),
        thickness: text(line.doorThickness) || (line.mode === 'Interior' ? '1-3/8' : '1-3/4'),
        doorType: text(line.doorType), drill: prepDisplay(line.prep), hinge: hingeDisplay(line, hingeColor),
        swing: isNoJamb(line) ? '' : text(line.hand), jamb: jambDisplay(line), sill: text(line.sill),
        weatherstrip: text(line.weatherstrip), notesGlass: notesGlass(line, status),
      },
    },
    detailRows: details,
    weightedUnits: 1 + (detailLineCount ? Math.max(2, Math.ceil(detailLineCount / 3)) : 0),
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
  const rowGroups = activeLines.map((line) => createWorkOrderRowGroup(line, aggregate.hingeColor));
  return {
    internalCorrelation: { internalJobId: aggregate.internalJobId, sourceAggregateRevision: aggregate.revision },
    visibleIdentifier, pdfFilename: createWorkOrderPdfFilename(visibleIdentifier), generatedAt: generatedAt.toISOString(),
    generatedDate: input.generatedDate, columns: WORK_ORDER_COLUMNS, header, rowGroups,
    pages: paginateWorkOrder(rowGroups, header),
  };
}
