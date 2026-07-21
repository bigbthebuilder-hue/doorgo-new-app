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
};
export type GlassGeometryValues = Record<string, string | number | boolean | null | PanelSidelight[]>;
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
  panelSidelights: PanelSidelight[];
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
  doorGoReference: string;
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
};

export type NativeJobAggregate = NativeJobHeader & { lines: NativeDoorLine[] };

export type JobHeaderFields = Pick<NativeJobHeader,
  'bizTrackSalesOrder' | 'customer' | 'siteAddress' | 'phone' | 'email' |
  'salesperson' | 'notes' | 'hingeColor' | 'shopHours' | 'shopHoursSource' |
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

export type UpdateJobHeaderCommand = {
  internalJobId: string;
  expectedRevision: number;
  actorUserId: string;
  input: JobHeaderInput;
  lines?: DoorLineInput[];
};

export type JobIntakeRepository = {
  list(): Promise<NativeJobAggregate[]>;
  findById(internalJobId: string): Promise<NativeJobAggregate | null>;
  create(command: CreateJobHeaderCommand): Promise<NativeJobAggregate>;
  update(command: UpdateJobHeaderCommand): Promise<NativeJobAggregate>;
};

export type JobIntakeFailureCode =
  | 'authentication_required' | 'active_profile_required' | 'permission_required'
  | 'validation_failed' | 'duplicate_biztrack_sales_order' | 'stale_revision'
  | 'not_found' | 'idempotency_conflict' | 'local_intake_disabled' | 'unavailable';

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
