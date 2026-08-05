import { normalizeDoorLineInput } from './door-line-contract';
import { normalizeJobHeaderInput } from './job-intake-contract';
import type { DoorLineInput, JobHeaderInput } from './job-intake-types';
import type {
  LegacyJobTransferPayloadV1,
  LegacyTransferField,
  LegacyTransferIssue,
  LegacyTransferMappingResult,
  UnifiedTransferIdentifier,
} from './legacy-transfer-types';
import { validateLegacyTransferPayload } from './legacy-transfer-validation';
import { uniqueLegacyTransferFields, uniqueLegacyTransferIssues } from './legacy-transfer-review-presentation';

function value<T>(field: LegacyTransferField<T>): T | null {
  return field.state === 'value' ? field.value : null;
}

function identifier(payload: LegacyJobTransferPayloadV1): UnifiedTransferIdentifier {
  const kind = payload.source.identifier_kind;
  return {
    kind,
    value: payload.source.identifier_value,
    label: kind === 'biztrack_sales_order' ? 'Sales Order' : kind === 'door_go_reference' ? 'DoorGo Reference' : 'Legacy Job ID',
  };
}

function header(payload: LegacyJobTransferPayloadV1): JobHeaderInput {
  return {
    bizTrackSalesOrder: payload.source.identifier_kind === 'biztrack_sales_order' ? payload.source.identifier_value : null,
    customer: value(payload.job.customer), siteAddress: value(payload.job.site_address),
    phone: value(payload.job.phone), email: value(payload.job.email), salesperson: value(payload.job.salesperson),
    poNumbers: value(payload.job.po_numbers) ?? [], notes: value(payload.job.notes), hingeColor: value(payload.job.hinge_color),
    lifecycleStage: value(payload.job.lifecycle_stage) ?? 'Draft', deliveryDate: value(payload.job.delivery_date),
    customerPickupDate: value(payload.job.customer_pickup_date), fulfillmentPlan: value(payload.job.fulfillment_plan),
    shopDate: value(payload.job.shop_date), shopDateSource: value(payload.job.shop_date_source),
    shopHours: value(payload.job.shop_hours), shopHoursSource: value(payload.job.shop_hours_source),
  };
}

function line(payload: LegacyJobTransferPayloadV1, index: number): DoorLineInput {
  const fields = payload.lines[index].fields;
  const glass = value(fields.glass_inputs);
  return {
    mode: value(fields.mode) ?? undefined, doorType: value(fields.door_type), config: value(fields.config) ?? undefined,
    width: value(fields.width) ?? undefined, height: value(fields.height) ?? undefined, customSlab: value(fields.custom_slab),
    customSlabWidth: value(fields.custom_slab_width), customSlabHeight: value(fields.custom_slab_height),
    hand: value(fields.hand), prep: value(fields.prep), jambWidth: value(fields.jamb_width), jambType: value(fields.jamb_type),
    sill: value(fields.sill), weatherstrip: value(fields.weatherstrip), hingeType: value(fields.hinge_type),
    notes: value(fields.notes), qty: value(fields.qty) ?? undefined, roWidth: value(fields.ro_width), roHeight: value(fields.ro_height),
    material: value(fields.material), doorThickness: value(fields.door_thickness), ripJamb: value(fields.rip_jamb),
    lineIndex: index + 1, lineStatus: 'Active',
    glassCalcStatus: glass ? 'Glass Detail Needed' : 'Ready',
    glassWorkorderDetail: null, glassWarnings: [], glassBlockers: [], glassOverride: null,
    glassUnits: [], glassCalc: null, vendorCopyText: null,
    sidelightType: glass?.sidelight_type ?? null, sidelightGlass: glass?.sidelight_glass ?? null,
    transomGlass: glass?.transom_glass ?? null, sidelightMeasurementLeft: glass?.sidelight_measurement_left ?? null,
    sidelightMeasurementRight: glass?.sidelight_measurement_right ?? null,
    panelSidelightWidth: glass?.panel_sidelight_width ?? null, panelSidelights: [], sidelightSpecifications: [],
    transomTBarSize: null, transomGlassTypeCode: null, transomCustomGlassDescription: null,
    includeDiagramOnWorkOrder: false,
  };
}

function lineEvidencePath(field: string, index: number): string {
  return /^lines\.\d+\./.test(field) ? field : `lines.${index}.${field}`;
}

function evidence(payload: LegacyJobTransferPayloadV1): LegacyTransferIssue[] {
  return [
    ...payload.review_evidence.map((entry) => ({ code: entry.code, path: entry.field, message: entry.message })),
    ...payload.lines.flatMap((line, index) => line.review_evidence.map((entry) => ({
      code: entry.code, path: lineEvidencePath(entry.field, index), message: entry.message,
    }))),
  ];
}

export function mapLegacyTransferToUnsavedEditor(input: string | unknown): LegacyTransferMappingResult {
  const validation = validateLegacyTransferPayload(input);
  if (validation.ok === false) return { ok: false, editor: null, provenance: null, warnings: [], blockers: validation.issues, unsupportedFields: validation.issues.filter((issue) => issue.code.includes('unsupported')).map((issue) => issue.path) };
  const payload = validation.payload;
  const mappedHeader = header(payload);
  const mappedLines = payload.lines.map((_, index) => line(payload, index));
  const blockers: LegacyTransferIssue[] = [];
  const normalizedHeader = normalizeJobHeaderInput(mappedHeader);
  if (normalizedHeader.ok === false) for (const [path, message] of Object.entries(normalizedHeader.fieldErrors)) blockers.push({ code: 'native_header_validation', path: `job.${path}`, message });
  const editorHeader: JobHeaderInput = normalizedHeader.ok
    ? { ...normalizedHeader.value, lifecycleStage: mappedHeader.lifecycleStage }
    : mappedHeader;
  const editorLines = mappedLines.map((entry, index) => {
    const normalized = normalizeDoorLineInput(entry);
    if (normalized.ok === false) for (const [path, message] of Object.entries(normalized.fieldErrors)) blockers.push({ code: 'native_line_validation', path: `lines.${index}.${path}`, message });
    if (normalized.ok === false) return entry;
    const hasGlassInputs = value(payload.lines[index].fields.glass_inputs) !== null;
    return {
      ...normalized.value, lineIndex: index + 1, lineStatus: 'Active' as const,
      ...(hasGlassInputs ? {
        glassCalcStatus: 'Glass Detail Needed' as const, glassWorkorderDetail: null,
        glassWarnings: [], glassBlockers: [], glassOverride: null, glassUnits: [], glassCalc: null,
        vendorCopyText: null, panelSidelights: [], sidelightSpecifications: [], transomTBarSize: null,
        transomGlassTypeCode: null, transomCustomGlassDescription: null, includeDiagramOnWorkOrder: false,
      } : {}),
    };
  });
  const review = evidence(payload);
  payload.lines.forEach((entry, index) => {
    if (value(entry.fields.glass_inputs)) review.push({ code: 'glass_recalculation_required', path: `lines.${index}.glass_inputs`, message: 'Review authoritative glass inputs and run the native glass builder before Save.' });
  });
  const declaredBlockers = [
    ...payload.review_evidence.filter((entry) => entry.severity === 'blocker').map((entry) => ({ code: entry.code, path: entry.field, message: entry.message })),
    ...payload.lines.flatMap((line, index) => line.review_evidence.filter((entry) => entry.severity === 'blocker').map((entry) => ({
      code: entry.code, path: lineEvidencePath(entry.field, index), message: entry.message,
    }))),
  ];
  blockers.push(...declaredBlockers);
  const unsupportedFields = uniqueLegacyTransferFields([
    ...payload.review_evidence.filter((entry) => entry.code.includes('unsupported')).map((entry) => entry.field),
    ...payload.lines.flatMap((line, index) => line.review_evidence.filter((entry) => entry.code.includes('unsupported')).map((entry) => lineEvidencePath(entry.field, index))),
  ]);
  return {
    ok: true,
    editor: { saved: false, internalJobId: null, doorGoReference: null, revision: null, primaryIdentifier: identifier(payload), header: editorHeader, lines: editorLines },
    provenance: {
      sourceSystem: payload.source.system, sourceIdentifier: payload.source.identifier_value,
      sourceIdentifierKind: payload.source.identifier_kind, sourceSavedAt: payload.source.saved_at,
      payloadSchema: payload.schema, payloadVersion: payload.version, exportedAt: payload.exported_at,
      sourceFingerprint: payload.source.source_fingerprint, transferLineIds: payload.lines.map((entry) => entry.transfer_line_id),
      sourceJobFields: payload.job,
      sourceLineFields: payload.lines.map((entry) => ({ transferLineId: entry.transfer_line_id, sourceLineIndex: entry.source_line_index, fields: entry.fields })),
    },
    warnings: uniqueLegacyTransferIssues(review.filter((issue) => !declaredBlockers.some((blocker) => blocker.code === issue.code && blocker.path === issue.path))),
    blockers: uniqueLegacyTransferIssues(blockers), unsupportedFields,
  };
}
