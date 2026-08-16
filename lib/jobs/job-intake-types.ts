export type JobLifecycleStage = 'Draft' | 'Confirmed Job';
export type DoorLineMode = 'Interior' | 'Exterior';
export type DoorLineStatus = 'Active' | 'Archived' | 'Merged';

export type GlassCalculationStatus =
  | 'Complete'
  | 'Glass Detail Needed'
  | 'Warning'
  | 'Blocked'
  | 'Manual Override'
  | 'Unsupported'
  | 'Ready'
  | 'Not Needed';

export type GlassIssue = { code: string; message: string };
export type SidelightType = 'Glass' | 'Panel';
export type GlassTypeCode = 'CLEAR' | 'SATIN_ETCH' | 'CUSTOM';
export type GlassTBarSize = '1.5' | '2.25';
export type PanelSizeMode = 'standard' | 'custom';
export type SidelightSpecification = {
  side: 'left' | 'right';
  index: number;
  finishedWidth: string | null;
  tBarSize: GlassTBarSize | null;
  glassTypeCode: GlassTypeCode | null;
  customGlassDescription: string | null;
  panelSizeMode: PanelSizeMode | null;
  panelConstructionNotes: string | null;
};
export type ResolvedTBar = {
  resolvedSize: GlassTBarSize;
  automaticDefault: GlassTBarSize;
  nonStandard: boolean;
};
export type ResolvedSidelight = {
  side: 'left' | 'right';
  index: number;
  sidelightType: SidelightType;
  finishedWidth: string;
  tBar: ResolvedTBar;
  glassTypeCode: GlassTypeCode | null;
  effectiveGlassDescription: string | null;
  panelSizeMode: PanelSizeMode | null;
  panelConstructionNotes: string | null;
};
export type GlassUnit = {
  position: string;
  width: string;
  height: string;
  glassType: string;
  termCode: string;
  qty: number;
};
export type PanelSidelight = {
  position: string;
  material: 'Wood' | 'Fiberglass';
  width: string;
  height: string;
  qty: number;
  constructionNotes?: string | null;
};
export type GlassGeometryValues = Record<string, string | number | boolean | null | PanelSidelight[] | ResolvedSidelight[] | ResolvedTBar>;
export type GlassOverrideApproval = {
  approvedLineId: string;
  calculatedValues: GlassGeometryValues;
  acceptedValues: GlassGeometryValues;
  reason: string;
  appliedByUserId: string;
  appliedByDisplayName: string | null;
  appliedAt: string;
};

export type NativeDoorLine = {
  lineId: string;
  lineIndex: number;
  lineStatus: DoorLineStatus;
  mode: DoorLineMode;
  doorType: string | null;
  config: string;
  width: string;
  height: string;
  customSlab: string | null;
  customSlabWidth: string | null;
  customSlabHeight: string | null;
  hand: string | null;
  prep: string | null;
  glass: string | null;
  jambWidth: string | null;
  jambType: string | null;
  sill: string | null;
  weatherstrip: string | null;
  hingeType: string | null;
  notes: string | null;
  qty: number;
  roWidth: string | null;
  roHeight: string | null;
  material: string | null;
  doorThickness: string | null;
  ripJamb: string | null;
  glassCalcStatus: GlassCalculationStatus | null;
  glassWorkorderDetail: string | null;
  glassWarnings: GlassIssue[];
  glassBlockers: GlassIssue[];
  glassOverride: GlassOverrideApproval | null;
  glassUnits: GlassUnit[];
  glassCalc: GlassGeometryValues | null;
  vendorCopyText: string | null;
  sidelightType: SidelightType | null;
  sidelightGlass: string | null;
  transomGlass: string | null;
  sidelightMeasurementLeft: string | null;
  sidelightMeasurementRight: string | null;
  panelSidelightWidth: string | null;
  sidelightSpecifications?: SidelightSpecification[];
  transomTBarSize?: GlassTBarSize | null;
  transomGlassTypeCode?: GlassTypeCode | null;
  transomCustomGlassDescription?: string | null;
  panelSidelights: PanelSidelight[];
  includeDiagramOnWorkOrder: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  updatedByUserId: string;
};

export type DoorLineInput = Partial<Omit<NativeDoorLine,
  'createdAt' | 'updatedAt' | 'createdByUserId' | 'updatedByUserId'
>> & Record<string, unknown>;

export type NativeJobHeader = {
  internalJobId: string;
  doorGoReference: string | null;
  bizTrackSalesOrder: string | null;
  customer: string | null;
  siteAddress: string | null;
  phone: string | null;
  email: string | null;
  salesperson: string | null;
  lifecycleStage: JobLifecycleStage;
  notes: string | null;
  hingeColor: string | null;
  shopHours: number | null;
  shopHoursSource: string | null;
  poNumbers: string[];
  fulfillmentPlan: string | null;
  deliveryDate: string | null;
  customerPickupDate: string | null;
  shopDate: string | null;
  shopDateSource: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  createdByUserId: string;
  updatedByUserId: string;
  origin?: 'native' | 'legacy_transfer';
  visibleIdentifier?: string;
  visibleIdentifierKind?: 'door_go_reference' | 'biztrack_sales_order' | 'legacy_job_id';
  legacyJobId?: string | null;
  legacyIdentifierKind?: string | null;
  transferSourceSystem?: string | null;
  transferSchema?: string | null;
  transferVersion?: number | null;
  transferSourceIdentifierKind?: 'biztrack_sales_order' | 'door_go_reference' | 'legacy_job_id' | null;
  transferSourceIdentifierValue?: string | null;
  transferSourceSavedAt?: string | null;
  transferExportedAt?: string | null;
  transferSourceFingerprint?: string | null;
  archivedAt?: string | null;
  archivedByUserId?: string | null;
  archiveReason?: string | null;
};

export type NativeJobAggregate = NativeJobHeader & { lines: NativeDoorLine[] };

export type NativeJobListCursor = { updatedAt: string; internalJobId: string };
export type NativeJobListRequest = { includeArchived?: boolean; limit?: number; cursor?: NativeJobListCursor | null };
export type NativeJobListItem = Pick<NativeJobHeader,
  'internalJobId' | 'doorGoReference' | 'bizTrackSalesOrder' | 'customer' | 'siteAddress' |
  'lifecycleStage' | 'createdAt' | 'updatedAt' | 'revision' | 'visibleIdentifier' |
  'visibleIdentifierKind' | 'legacyJobId'
> & { activeLineCount: number; archivedLineCount: number; archivedAt: string | null };
export type NativeJobListPage = {
  items: NativeJobListItem[];
  page: { limit: number; hasMore: boolean; nextCursor: NativeJobListCursor | null };
};
export type ArchiveJobCommand = { internalJobId: string; expectedRevision: number; reason: string };
export type DeleteJobCommand = { internalJobId: string; expectedRevision: number };
export type DeleteJobResult = { internalJobId: string; visibleIdentifier: string; deletedProductionBookings: number };

export type JobHeaderFields = Pick<NativeJobHeader,
  'bizTrackSalesOrder' | 'customer' | 'siteAddress' | 'phone' | 'email' |
  'salesperson' | 'notes' | 'hingeColor' | 'shopHours' | 'shopHoursSource' |
  'poNumbers' |
  'fulfillmentPlan' | 'deliveryDate' | 'customerPickupDate' | 'shopDate' |
  'shopDateSource'
>;

export type JobHeaderInput = Partial<Record<keyof JobHeaderFields, unknown>> & {
  lifecycleStage?: unknown;
};

export type CreateJobHeaderCommand = {
  commandId: string;
  actorUserId: string;
  defaultSalesperson: string | null;
  input: JobHeaderInput;
  lines?: DoorLineInput[];
};

export type LegacyTransferCreateProvenance = {
  direction: 'legacy_to_native';
  sourceSystem: 'legacy-doorgo';
  sourceJobState: 'active';
  transferSchema: 'doorgo.legacy-job-transfer';
  transferVersion: 1;
  sourceIdentifierKind: 'biztrack_sales_order' | 'door_go_reference' | 'legacy_job_id';
  sourceIdentifierValue: string;
  sourceSavedAt: string;
  exportedAt: string;
  sourceFingerprint: string;
};

export type CreateTransferredJobCommand = {
  commandId: string;
  actorUserId: string;
  defaultSalesperson: string | null;
  provenance: LegacyTransferCreateProvenance;
  input: JobHeaderInput;
  lines: DoorLineInput[];
};

export type UpdateJobHeaderCommand = {
  internalJobId: string;
  expectedRevision: number;
  actorUserId: string;
  input: JobHeaderInput;
  lines?: DoorLineInput[];
};

export type JobIntakeRepository = {
  list(): Promise<NativeJobListItem[]>;
  listPage(request?: NativeJobListRequest): Promise<NativeJobListPage>;
  findById(internalJobId: string): Promise<NativeJobAggregate | null>;
  create(command: CreateJobHeaderCommand): Promise<NativeJobAggregate>;
  createTransferred(command: CreateTransferredJobCommand): Promise<NativeJobAggregate>;
  update(command: UpdateJobHeaderCommand): Promise<NativeJobAggregate>;
  archive(command: ArchiveJobCommand): Promise<NativeJobAggregate>;
  deletePermanently(command: DeleteJobCommand): Promise<DeleteJobResult>;
};

export type JobIntakeFailureCode =
  | 'authentication_required' | 'active_profile_required' | 'permission_required'
  | 'validation_failed' | 'duplicate_biztrack_sales_order' | 'stale_revision'
  | 'duplicate_door_go_reference' | 'archived' | 'not_found' | 'idempotency_conflict'
  | 'duplicate_legacy_job_id' | 'duplicate_source_fingerprint' | 'duplicate_legacy_transfer'
  | 'manager_required' | 'local_intake_disabled' | 'unavailable';

export class JobIntakeFailure extends Error {
  constructor(
    public readonly code: JobIntakeFailureCode,
    message: string,
    public readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'JobIntakeFailure';
  }
}

export type JobIntakeActionResult =
  | { ok: true; job: NativeJobAggregate }
  | { ok: false; code: JobIntakeFailureCode; message: string; fieldErrors?: Record<string, string> };
