export type JobLifecycleStage = 'Draft';

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

export type JobHeaderFields = Pick<
  NativeJobHeader,
  | 'bizTrackSalesOrder'
  | 'customer'
  | 'siteAddress'
  | 'phone'
  | 'email'
  | 'salesperson'
  | 'notes'
  | 'hingeColor'
  | 'shopHours'
  | 'shopHoursSource'
  | 'fulfillmentPlan'
  | 'deliveryDate'
  | 'customerPickupDate'
  | 'shopDate'
  | 'shopDateSource'
>;

export type JobHeaderInput = Partial<Record<keyof JobHeaderFields, unknown>> & {
  lifecycleStage?: unknown;
};

export type CreateJobHeaderCommand = {
  commandId: string;
  actorUserId: string;
  defaultSalesperson: string | null;
  input: JobHeaderInput;
};

export type UpdateJobHeaderCommand = {
  internalJobId: string;
  expectedRevision: number;
  actorUserId: string;
  input: JobHeaderInput;
};

export type JobIntakeRepository = {
  list(): Promise<NativeJobHeader[]>;
  findById(internalJobId: string): Promise<NativeJobHeader | null>;
  create(command: CreateJobHeaderCommand): Promise<NativeJobHeader>;
  update(command: UpdateJobHeaderCommand): Promise<NativeJobHeader>;
};

export type JobIntakeFailureCode =
  | 'authentication_required'
  | 'active_profile_required'
  | 'permission_required'
  | 'validation_failed'
  | 'duplicate_biztrack_sales_order'
  | 'stale_revision'
  | 'not_found'
  | 'idempotency_conflict'
  | 'local_intake_disabled'
  | 'unavailable';

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
  | { ok: true; job: NativeJobHeader }
  | {
      ok: false;
      code: JobIntakeFailureCode;
      message: string;
      fieldErrors?: Record<string, string>;
    };
