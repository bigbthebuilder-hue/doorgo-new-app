import type { DoorLineInput, JobHeaderInput } from './job-intake-types';

export const LEGACY_TRANSFER_SCHEMA = 'doorgo.legacy-job-transfer' as const;
export const LEGACY_TRANSFER_VERSION = 1 as const;
export const LEGACY_TRANSFER_DIRECTION = 'legacy-to-native' as const;
export const LEGACY_TRANSFER_SOURCE_SYSTEM = 'legacy-doorgo' as const;
export const LEGACY_TRANSFER_MAX_BYTES = 1024 * 1024;
export const LEGACY_TRANSFER_MAX_LINES = 250;

export type LegacyIdentifierKind = 'biztrack_sales_order' | 'door_go_reference' | 'legacy_job_id';
export type LegacyTransferFieldState = 'value' | 'missing' | 'not_applicable';
export type LegacyTransferScalar = string | number | boolean | null;

export type LegacyTransferField<T = LegacyTransferScalar | LegacyTransferScalar[]> =
  | { state: 'value'; value: T; source_value: T }
  | { state: 'missing'; source_value: null }
  | { state: 'not_applicable'; source_value: null };

export type LegacyTransferReviewEvidence = {
  code: string;
  field: string;
  message: string;
  severity: 'warning' | 'blocker';
};

export type LegacyTransferJobFields = {
  customer: LegacyTransferField<string>;
  site_address: LegacyTransferField<string>;
  phone: LegacyTransferField<string>;
  email: LegacyTransferField<string>;
  salesperson: LegacyTransferField<string>;
  po_numbers: LegacyTransferField<string[]>;
  notes: LegacyTransferField<string>;
  hinge_color: LegacyTransferField<string>;
  lifecycle_stage: LegacyTransferField<'Draft' | 'Confirmed Job'>;
  delivery_date: LegacyTransferField<string>;
  customer_pickup_date: LegacyTransferField<string>;
  fulfillment_plan: LegacyTransferField<'Delivery' | 'Customer Pickup'>;
  shop_date: LegacyTransferField<string>;
  shop_date_source: LegacyTransferField<string>;
  shop_hours: LegacyTransferField<number>;
  shop_hours_source: LegacyTransferField<string>;
};

export type LegacyGlassInputs = {
  status: 'supported' | 'needs_review' | 'unsupported';
  sidelight_type: 'Glass' | 'Panel' | null;
  sidelight_glass: string | null;
  transom_glass: string | null;
  sidelight_measurement_left: string | null;
  sidelight_measurement_right: string | null;
  panel_sidelight_width: string | null;
};

export type LegacyTransferLineFields = {
  mode: LegacyTransferField<'Interior' | 'Exterior'>;
  door_type: LegacyTransferField<string>;
  config: LegacyTransferField<string>;
  width: LegacyTransferField<string>;
  height: LegacyTransferField<string>;
  custom_slab: LegacyTransferField<string>;
  custom_slab_width: LegacyTransferField<string>;
  custom_slab_height: LegacyTransferField<string>;
  hand: LegacyTransferField<string>;
  prep: LegacyTransferField<string>;
  jamb_width: LegacyTransferField<string>;
  jamb_type: LegacyTransferField<string>;
  sill: LegacyTransferField<string>;
  weatherstrip: LegacyTransferField<string>;
  hinge_type: LegacyTransferField<string>;
  notes: LegacyTransferField<string>;
  qty: LegacyTransferField<number>;
  ro_width: LegacyTransferField<string>;
  ro_height: LegacyTransferField<string>;
  material: LegacyTransferField<string>;
  door_thickness: LegacyTransferField<string>;
  rip_jamb: LegacyTransferField<string>;
  glass_inputs: LegacyTransferField<LegacyGlassInputs>;
};

export type LegacyTransferLine = {
  transfer_line_id: string;
  source_line_index: number;
  line_state: 'active';
  fields: LegacyTransferLineFields;
  review_evidence: LegacyTransferReviewEvidence[];
};

export type LegacyJobTransferPayloadV1 = {
  schema: typeof LEGACY_TRANSFER_SCHEMA;
  version: typeof LEGACY_TRANSFER_VERSION;
  direction: typeof LEGACY_TRANSFER_DIRECTION;
  export_id: string;
  exported_at: string;
  source: {
    system: typeof LEGACY_TRANSFER_SOURCE_SYSTEM;
    job_state: 'active';
    identifier_kind: LegacyIdentifierKind;
    identifier_value: string;
    saved_at: string;
    source_fingerprint: string;
  };
  job: LegacyTransferJobFields;
  lines: LegacyTransferLine[];
  review_evidence: LegacyTransferReviewEvidence[];
};

export type LegacyTransferIssue = { code: string; path: string; message: string };
export type LegacyTransferValidation =
  | { ok: true; payload: LegacyJobTransferPayloadV1; encodedBytes: number }
  | { ok: false; issues: LegacyTransferIssue[]; encodedBytes: number };

export type UnifiedTransferIdentifier = {
  kind: LegacyIdentifierKind;
  value: string;
  label: 'Sales Order' | 'DoorGo Reference' | 'Legacy Job ID';
};

export type UnsavedLegacyTransferEditorState = {
  saved: false;
  internalJobId: null;
  doorGoReference: null;
  revision: null;
  primaryIdentifier: UnifiedTransferIdentifier;
  header: JobHeaderInput;
  lines: DoorLineInput[];
};

export type LegacyTransferProvenance = {
  sourceSystem: typeof LEGACY_TRANSFER_SOURCE_SYSTEM;
  sourceIdentifier: string;
  sourceIdentifierKind: LegacyIdentifierKind;
  sourceSavedAt: string;
  payloadSchema: typeof LEGACY_TRANSFER_SCHEMA;
  payloadVersion: typeof LEGACY_TRANSFER_VERSION;
  exportedAt: string;
  sourceFingerprint: string;
  transferLineIds: string[];
  sourceJobFields: LegacyTransferJobFields;
  sourceLineFields: { transferLineId: string; sourceLineIndex: number; fields: LegacyTransferLineFields }[];
};

export type LegacyTransferMappingResult =
  | {
    ok: true;
    editor: UnsavedLegacyTransferEditorState;
    provenance: LegacyTransferProvenance;
    warnings: LegacyTransferIssue[];
    blockers: LegacyTransferIssue[];
    unsupportedFields: string[];
  }
  | {
    ok: false;
    editor: null;
    provenance: null;
    warnings: [];
    blockers: LegacyTransferIssue[];
    unsupportedFields: string[];
  };
